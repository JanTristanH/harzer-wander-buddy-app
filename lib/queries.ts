import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchParkingDetail,
  fetchFriendsOverview,
  fetchLatestVisitedStamp,
  fetchMapData,
  fetchStampDetail,
  fetchProfileOverview,
  fetchUserProfileOverview,
  fetchStampboxes,
  type FriendsOverviewData,
  type LatestVisitedStamp,
  type MapData,
  type ParkingDetailData,
  type ProfileOverviewData,
  type StampDetailData,
  type Stampbox,
  type UserProfileOverviewData,
} from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';

type AuthClaims = {
  sub?: string;
  name?: string;
  picture?: string;
};

type StampsOverviewData = {
  stamps: Stampbox[];
  lastVisited: LatestVisitedStamp | null;
};

export async function fetchStampsOverviewData(accessToken: string, userId?: string): Promise<StampsOverviewData> {
  const [stamps, lastVisited] = await Promise.all([
    fetchStampboxes(accessToken),
    fetchLatestVisitedStamp(accessToken, userId),
  ]);

  return {
    stamps,
    lastVisited,
  };
}

export const queryKeys = {
  stampsOverview: (userId?: string) => ['stamps-overview', userId ?? 'anonymous'] as const,
  mapData: (userId?: string) => ['map-data', userId ?? 'anonymous'] as const,
  friendsOverview: (userId?: string) => ['friends-overview', userId ?? 'anonymous'] as const,
  profileOverview: (userId?: string) => ['profile-overview', userId ?? 'anonymous'] as const,
  userProfileOverview: (userId: string | undefined, targetUserId: string | undefined) =>
    ['user-profile-overview', userId ?? 'anonymous', targetUserId ?? 'unknown'] as const,
  stampDetail: (userId: string | undefined, stampId: string | undefined) =>
    ['stamp-detail', userId ?? 'anonymous', stampId ?? 'unknown'] as const,
  parkingDetail: (userId: string | undefined, parkingId: string | undefined) =>
    ['parking-detail', userId ?? 'anonymous', parkingId ?? 'unknown'] as const,
};

function getCachedUserProfileSummary(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  targetUserId: string
) {
  const friendsOverview = queryClient.getQueryData<FriendsOverviewData>(queryKeys.friendsOverview(userId));
  const acceptedFriend = friendsOverview?.friends.find((friend) => friend.id === targetUserId);
  if (acceptedFriend) {
    return {
      userId: targetUserId,
      name: acceptedFriend.name,
      picture: acceptedFriend.picture,
      relationship: 'friend' as const,
      visitedCount: acceptedFriend.visitedCount,
      completionPercent: acceptedFriend.completionPercent,
    };
  }

  const incomingRequest = friendsOverview?.incomingRequests.find((request) => request.userId === targetUserId);
  if (incomingRequest) {
    return {
      userId: targetUserId,
      name: incomingRequest.name,
      picture: incomingRequest.picture,
      relationship: 'incoming_request' as const,
      visitedCount: 0,
      completionPercent: 0,
    };
  }

  const outgoingRequest = friendsOverview?.outgoingRequests.find((request) => request.userId === targetUserId);
  if (outgoingRequest) {
    return {
      userId: targetUserId,
      name: outgoingRequest.name,
      picture: outgoingRequest.picture,
      relationship: 'outgoing_request' as const,
      visitedCount: 0,
      completionPercent: 0,
    };
  }

  const profileOverview = queryClient.getQueryData<ProfileOverviewData>(queryKeys.profileOverview(userId));
  const friendFromProfile = profileOverview?.friends.find((friend) => friend.id === targetUserId);
  if (friendFromProfile) {
    return {
      userId: targetUserId,
      name: friendFromProfile.name,
      picture: friendFromProfile.picture,
      relationship: 'friend' as const,
      visitedCount: friendFromProfile.visitedCount,
      completionPercent: friendFromProfile.completionPercent,
    };
  }

  return undefined;
}

function getCachedStamp(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  stampId: string
) {
  const stampsOverview = queryClient.getQueryData<StampsOverviewData>(queryKeys.stampsOverview(userId));
  const fromOverview = stampsOverview?.stamps.find((stamp) => stamp.ID === stampId);
  if (fromOverview) {
    return fromOverview;
  }

  const profileOverview = queryClient.getQueryData<ProfileOverviewData>(queryKeys.profileOverview(userId));
  const fromProfile = profileOverview?.stamps.find((stamp) => stamp.ID === stampId);
  if (fromProfile) {
    return fromProfile;
  }

  const mapData = queryClient.getQueryData<MapData>(queryKeys.mapData(userId));
  const fromMap = mapData?.stamps.find((stamp) => stamp.ID === stampId);
  if (fromMap) {
    return fromMap;
  }

  return undefined;
}

function getCachedParking(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  parkingId: string
) {
  const mapData = queryClient.getQueryData<MapData>(queryKeys.mapData(userId));
  const fromMap = mapData?.parkingSpots.find((parking) => parking.ID === parkingId);
  if (fromMap) {
    return fromMap;
  }

  return undefined;
}

function getCachedMapData(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined
) {
  const existingMapData = queryClient.getQueryData<MapData>(queryKeys.mapData(userId));
  if (existingMapData) {
    return existingMapData;
  }

  const stampsOverview = queryClient.getQueryData<StampsOverviewData>(queryKeys.stampsOverview(userId));
  if (!stampsOverview) {
    return undefined;
  }

  return {
    stamps: stampsOverview.stamps.map((stamp) => ({
      ...stamp,
      visitedAt: stampsOverview.lastVisited?.stampId === stamp.ID ? stampsOverview.lastVisited.visitedAt : undefined,
      kind: stamp.hasVisited ? ('visited-stamp' as const) : ('open-stamp' as const),
    })),
    parkingSpots: [],
  } satisfies MapData;
}

function getCachedSelfProfileOverview(
  queryClient: ReturnType<typeof useQueryClient>,
  claims: AuthClaims | null,
  currentUserProfile?: {
    id: string;
    name: string;
    picture?: string;
  } | null
) {
  const existingProfileOverview = queryClient.getQueryData<ProfileOverviewData>(
    queryKeys.profileOverview(claims?.sub)
  );
  if (existingProfileOverview) {
    return existingProfileOverview;
  }

  const stampsOverview = queryClient.getQueryData<StampsOverviewData>(
    queryKeys.stampsOverview(claims?.sub)
  );
  const friendsOverview = queryClient.getQueryData<FriendsOverviewData>(
    queryKeys.friendsOverview(claims?.sub)
  );

  if (!claims?.sub && !stampsOverview && !friendsOverview) {
    return undefined;
  }

  const stamps = stampsOverview?.stamps ?? [];
  const visitedCount = stamps.filter((stamp) => stamp.hasVisited).length;
  const totalCount = stamps.length;
  const openCount = Math.max(0, totalCount - visitedCount);
  const completionPercent = totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : 0;

  return {
    name: currentUserProfile?.name || claims?.name || claims?.sub || 'Profil',
    picture: currentUserProfile?.picture || claims?.picture,
    visitedCount,
    totalCount,
    openCount,
    completionPercent,
    friendCount: friendsOverview?.friendCount ?? 0,
    collectorSinceYear: null,
    latestVisits: [],
    featuredFriend: null,
    friends: friendsOverview?.friends ?? [],
    stamps,
    achievements: [],
  } satisfies ProfileOverviewData;
}

function useAuthorizedRequest() {
  const { accessToken, logout } = useAuth();

  return async function authorizedRequest<T>(request: (token: string) => Promise<T>) {
    if (!accessToken) {
      throw new Error('No access token available.');
    }

    try {
      return await request(accessToken);
    } catch (error) {
      if (error instanceof Error && error.name === 'UnauthorizedError') {
        await logout();
      }

      throw error;
    }
  };
}

export function useStampsOverviewQuery() {
  const claims = useIdTokenClaims<AuthClaims>();
  const { accessToken, isAuthenticated } = useAuth();
  const authorizedRequest = useAuthorizedRequest();

  return useQuery<StampsOverviewData>({
    queryKey: queryKeys.stampsOverview(claims?.sub),
    enabled: Boolean(accessToken && isAuthenticated),
    queryFn: () => authorizedRequest((token) => fetchStampsOverviewData(token, claims?.sub)),
  });
}

export function useMapDataQuery() {
  const claims = useIdTokenClaims<AuthClaims>();
  const { accessToken, isAuthenticated } = useAuth();
  const authorizedRequest = useAuthorizedRequest();
  const queryClient = useQueryClient();

  return useQuery<MapData>({
    queryKey: queryKeys.mapData(claims?.sub),
    enabled: Boolean(accessToken && isAuthenticated),
    placeholderData: () => getCachedMapData(queryClient, claims?.sub),
    queryFn: () =>
      authorizedRequest((token) => {
        const cachedStampsOverview = queryClient.getQueryData<StampsOverviewData>(
          queryKeys.stampsOverview(claims?.sub)
        );

        return fetchMapData(
          token,
          claims?.sub,
          cachedStampsOverview?.stamps,
          cachedStampsOverview?.lastVisited
        );
      }),
  });
}

export function useFriendsOverviewQuery() {
  const claims = useIdTokenClaims<AuthClaims>();
  const { accessToken, isAuthenticated } = useAuth();
  const authorizedRequest = useAuthorizedRequest();

  return useQuery<FriendsOverviewData>({
    queryKey: queryKeys.friendsOverview(claims?.sub),
    enabled: Boolean(accessToken && isAuthenticated),
    queryFn: () => authorizedRequest((token) => fetchFriendsOverview(token, claims?.sub)),
  });
}

export function useProfileOverviewQuery() {
  const claims = useIdTokenClaims<AuthClaims>();
  const { accessToken, currentUserProfile, isAuthenticated } = useAuth();
  const authorizedRequest = useAuthorizedRequest();
  const queryClient = useQueryClient();

  return useQuery<ProfileOverviewData>({
    queryKey: queryKeys.profileOverview(claims?.sub),
    enabled: Boolean(accessToken && isAuthenticated),
    placeholderData: () => getCachedSelfProfileOverview(queryClient, claims, currentUserProfile),
    queryFn: () =>
      authorizedRequest((token) => {
        const cachedStampsOverview = queryClient.getQueryData<StampsOverviewData>(
          queryKeys.stampsOverview(claims?.sub)
        );
        const prefetchedCurrentUser = currentUserProfile
          ? {
              id: currentUserProfile.id,
              name: currentUserProfile.name,
              picture: currentUserProfile.picture,
            }
          : claims?.sub
            ? {
                id: claims.sub,
                name: claims.name,
                picture: claims.picture,
              }
            : null;

        return fetchProfileOverview(
          token,
          claims?.sub,
          prefetchedCurrentUser,
          cachedStampsOverview?.stamps
        );
      }),
  });
}

export function useStampDetailQuery(stampId?: string) {
  const claims = useIdTokenClaims<AuthClaims>();
  const { accessToken, isAuthenticated } = useAuth();
  const authorizedRequest = useAuthorizedRequest();
  const queryClient = useQueryClient();

  return useQuery<StampDetailData>({
    queryKey: queryKeys.stampDetail(claims?.sub, stampId),
    enabled: Boolean(accessToken && isAuthenticated && stampId),
    placeholderData: () => {
      if (!stampId) {
        return undefined;
      }

      const cachedStamp = getCachedStamp(queryClient, claims?.sub, stampId);
      if (!cachedStamp) {
        return undefined;
      }

      return {
        stamp: cachedStamp,
        nearbyStamps: [],
        nearbyParking: [],
        friendVisits: [],
        myVisits: [],
      } satisfies StampDetailData;
    },
    queryFn: () => authorizedRequest((token) => fetchStampDetail(token, stampId!, claims?.sub)),
  });
}

export function useParkingDetailQuery(parkingId?: string) {
  const claims = useIdTokenClaims<AuthClaims>();
  const { accessToken, isAuthenticated } = useAuth();
  const authorizedRequest = useAuthorizedRequest();
  const queryClient = useQueryClient();

  return useQuery<ParkingDetailData>({
    queryKey: queryKeys.parkingDetail(claims?.sub, parkingId),
    enabled: Boolean(accessToken && isAuthenticated && parkingId),
    placeholderData: () => {
      if (!parkingId) {
        return undefined;
      }

      const cachedParking = getCachedParking(queryClient, claims?.sub, parkingId);
      if (!cachedParking) {
        return undefined;
      }

      return {
        parking: cachedParking,
        nearbyStamps: [],
        nearbyParking: [],
      } satisfies ParkingDetailData;
    },
    queryFn: () => authorizedRequest((token) => fetchParkingDetail(token, parkingId!)),
  });
}

export function useUserProfileOverviewQuery(targetUserId?: string) {
  const claims = useIdTokenClaims<AuthClaims>();
  const { accessToken, isAuthenticated } = useAuth();
  const authorizedRequest = useAuthorizedRequest();
  const queryClient = useQueryClient();

  return useQuery<UserProfileOverviewData>({
    queryKey: queryKeys.userProfileOverview(claims?.sub, targetUserId),
    enabled: Boolean(accessToken && isAuthenticated && targetUserId),
    placeholderData: () => {
      if (!targetUserId) {
        return undefined;
      }

      const cachedSummary = getCachedUserProfileSummary(queryClient, claims?.sub, targetUserId);
      if (!cachedSummary) {
        return undefined;
      }

      return {
        userId: cachedSummary.userId,
        name: cachedSummary.name,
        picture: cachedSummary.picture,
        relationship: cachedSummary.relationship,
        friendshipId: null,
        pendingRequestId: null,
        isAllowedToStampForMe: false,
        visitedCount: cachedSummary.visitedCount,
        completionPercent: cachedSummary.completionPercent,
        sharedVisitedCount: 0,
        collectorSinceYear: null,
        latestVisits: [],
        friends: [],
        achievements: [],
        stampBuckets: {
          shared: 0,
          friendOnly: 0,
          meOnly: 0,
          neither: 0,
        },
        stampComparisons: [],
      } satisfies UserProfileOverviewData;
    },
    queryFn: () => authorizedRequest((token) => fetchUserProfileOverview(token, targetUserId!)),
  });
}
