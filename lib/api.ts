import { appConfig } from '@/lib/config';

export type Stampbox = {
  ID: string;
  number: string;
  orderBy?: string;
  name: string;
  description?: string;
  image?: string;
  latitude?: number;
  longitude?: number;
  hasVisited?: boolean;
  totalGroupStampings?: number;
  stampedUsers?: string | string[];
  stampedUserIds?: string | string[];
};

type ODataCollection<T> = {
  value?: T[];
};

type NeighborStampRow = {
  ID: string;
  NeighborsID: string;
  NeighborsNumber?: string;
  distanceKm?: number;
};

type NeighborParkingRow = {
  ID: string;
  NeighborsID: string;
  distanceKm?: number;
};

export type ParkingSpot = {
  ID: string;
  name?: string;
  description?: string;
  image?: string;
  latitude?: number;
  longitude?: number;
};

type Stamping = {
  ID: string;
  visitedAt?: string;
  createdAt?: string;
  createdBy?: string;
  stamp_ID?: string;
};

export type VisitStamping = Stamping;

type MyFriend = {
  ID: string;
  name?: string;
  picture?: string;
  FriendshipID?: string;
  isAllowedToStampForMe?: boolean;
  isAllowedToStampForFriend?: boolean;
};

type User = {
  ID: string;
  name?: string;
  picture?: string;
  isFriend?: boolean;
  friends?: User[];
  Friends?: User[];
};

type Attachment = {
  ID: string;
  url?: string;
  filename?: string;
  mimeType?: string;
};

type PendingFriendshipRequest = {
  ID: string;
  fromUser_ID?: string;
  toUser_ID?: string;
  outgoingFriendship_ID?: string;
  fromUser?: User;
  toUser?: User;
};

type FriendshipRecord = {
  ID: string;
  fromUser_ID?: string;
  toUser_ID?: string;
  toUser?: User;
};

export type ProfileOverviewData = {
  name: string;
  picture?: string;
  visitedCount: number;
  totalCount: number;
  openCount: number;
  completionPercent: number;
  friendCount: number;
  collectorSinceYear: number | null;
  latestVisits: Array<{
    id: string;
    stampId: string;
    stampNumber?: string;
    stampName: string;
    visitedAt?: string;
  }>;
  featuredFriend: {
    id: string;
    name: string;
    picture?: string;
    visitedCount: number | null;
    completionPercent: number | null;
  } | null;
  friends: {
    id: string;
    name: string;
    picture?: string;
    visitedCount: number;
    completionPercent: number;
  }[];
  stamps: Stampbox[];
  achievements: Array<{
    id: string;
    label: string;
    value: string;
  }>;
};

export type LatestVisitedStamp = {
  stampId: string;
  stampNumber?: string;
  stampName: string;
  visitedAt?: string;
};

export type FriendsOverviewData = {
  currentUserId: string;
  friendCount: number;
  incomingRequestCount: number;
  outgoingRequestCount: number;
  friends: Array<{
    id: string;
    name: string;
    picture?: string;
    visitedCount: number;
    completionPercent: number;
  }>;
  incomingRequests: Array<{
    id: string;
    pendingRequestId: string;
    userId: string;
    name: string;
    picture?: string;
  }>;
  outgoingRequests: Array<{
    id: string;
    pendingRequestId: string;
    userId: string;
    name: string;
    picture?: string;
  }>;
};

export type SearchUserResult = {
  id: string;
  name: string;
  picture?: string;
  isFriend: boolean;
};

export type CurrentUserProfileData = {
  id: string;
  name: string;
  picture?: string;
};

export type FriendshipRelationshipState =
  | 'self'
  | 'friend'
  | 'incoming_request'
  | 'outgoing_request'
  | 'not_connected';

export type UserProfileOverviewData = {
  userId: string;
  name: string;
  picture?: string;
  relationship: FriendshipRelationshipState;
  friendshipId: string | null;
  pendingRequestId: string | null;
  isAllowedToStampForMe: boolean;
  visitedCount: number;
  completionPercent: number;
  sharedVisitedCount: number;
  collectorSinceYear: number | null;
  latestVisits: Array<{
    id: string;
    stampId: string;
    stampNumber?: string;
    stampName: string;
    visitedAt?: string;
  }>;
  friends: Array<{
    id: string;
    name: string;
    picture?: string;
    visitedCount: number;
    completionPercent: number;
  }>;
  achievements: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  stampBuckets: {
    shared: number;
    friendOnly: number;
    meOnly: number;
    neither: number;
  };
  stampComparisons: Array<{
    stamp: Stampbox;
    meVisited: boolean;
    userVisited: boolean;
  }>;
};

export type StampDetailData = {
  stamp: Stampbox;
  nearbyStamps: {
    ID: string;
    number?: string;
    name: string;
    distanceKm: number | null;
    durationMinutes: number | null;
  }[];
  nearbyParking: {
    ID: string;
    name: string;
    distanceKm: number | null;
    durationMinutes: number | null;
  }[];
  friendVisits: {
    id: string;
    name: string;
    createdAt?: string;
  }[];
  myVisits: VisitStamping[];
};

export type MapStamp = Stampbox & {
  kind: 'visited-stamp' | 'open-stamp';
  visitedAt?: string;
};

export type MapParkingSpot = ParkingSpot & {
  kind: 'parking';
};

export type MapData = {
  stamps: MapStamp[];
  parkingSpots: MapParkingSpot[];
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function buildQuery(query?: [string, string | number | boolean | undefined][]) {
  if (!query) {
    return '';
  }

  const parts = query
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function buildUrl(path: string, query?: [string, string | number | boolean | undefined][]) {
  return `${normalizeBaseUrl(appConfig.backendUrl)}/odata/v4/api/${path}${buildQuery(query)}`;
}

function buildV2Url(path: string) {
  return `${normalizeBaseUrl(appConfig.backendUrl)}/odata/v2/api/${path}`;
}

function buildStringKeyPath(entitySet: string, id: string) {
  return `${entitySet}('${escapeODataString(id)}')`;
}

function escapeODataString(value: string) {
  return value.replace(/'/g, "''");
}

async function fetchOData<T>(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    const error = new Error('Unauthorized');
    error.name = 'UnauthorizedError';
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function mutateOData<T>(
  accessToken: string,
  url: string,
  init: RequestInit & { body?: string }
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401 || response.status === 403) {
    const error = new Error('Unauthorized');
    error.name = 'UnauthorizedError';
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

async function fetchCollection<T>(
  accessToken: string,
  entitySet: string,
  query?: [string, string | number | boolean | undefined][]
) {
  const payload = await fetchOData<ODataCollection<T>>(accessToken, buildUrl(entitySet, query));
  return payload.value ?? [];
}

async function fetchEntityById<T>(
  accessToken: string,
  entitySet: string,
  id: string,
  query?: [string, string | number | boolean | undefined][]
) {
  const fallbacks = [`ID eq ${id}`, `ID eq guid'${id}'`];

  for (const filter of fallbacks) {
    try {
      const rows = await fetchCollection<T>(accessToken, entitySet, [
        ...(query ?? []),
        ['$filter', filter],
        ['$top', 1],
      ]);

      if (rows.length > 0) {
        return rows[0];
      }
    } catch {
      continue;
    }
  }

  throw new Error(`${entitySet} ${id} not found`);
}

async function fetchStringEntityById<T>(
  accessToken: string,
  entitySet: string,
  field: string,
  value: string,
  query?: [string, string | number | boolean | undefined][]
) {
  const rows = await fetchCollection<T>(accessToken, entitySet, [
    ...(query ?? []),
    ['$filter', `${field} eq '${escapeODataString(value)}'`],
    ['$top', 1],
  ]);

  if (rows.length > 0) {
    return rows[0];
  }

  throw new Error(`${entitySet} ${value} not found`);
}

async function fetchCurrentUserRecord(accessToken: string) {
  const currentUser = await fetchOData<User>(accessToken, buildUrl('getCurrentUser()'));
  return fetchStringEntityById<User>(accessToken, 'Users', 'ID', currentUser.ID, [
    ['$select', 'ID,name,picture,isFriend'],
  ]);
}

async function buildFriendProgress(
  accessToken: string,
  friends: Array<{
    ID: string;
    name?: string;
    picture?: string;
  }>,
  totalCount: number
) {
  const friendProgress = await Promise.all(
    friends.map(async (friend) => {
      const friendStampboxes = await fetchComparisonStampboxes(accessToken, [friend.ID]);
      const visitedCount = friendStampboxes.filter((stamp) => Number(stamp.totalGroupStampings || 0) > 0).length;

      return {
        id: friend.ID,
        name: friend.name || 'Freund',
        picture: friend.picture,
        visitedCount,
        completionPercent: totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : 0,
      };
    })
  );

  return friendProgress.sort(
    (left, right) => right.visitedCount - left.visitedCount || left.name.localeCompare(right.name)
  );
}

async function fetchUserFriends(accessToken: string, userId: string) {
  const rows = await fetchCollection<FriendshipRecord>(accessToken, 'Friendships', [
    ['$select', 'ID,toUser_ID'],
    ['$filter', `fromUser_ID eq '${escapeODataString(userId)}'`],
    ['$expand', 'toUser($select=ID,name,picture)'],
    ['$top', 250],
  ]);

  return rows
    .map((row) => row.toUser)
    .filter((friend): friend is User => Boolean(friend?.ID));
}

async function fetchComparisonStampboxes(accessToken: string, groupUserIds: string[]) {
  const groupFilter = [...new Set(groupUserIds.filter(Boolean))].join(',');
  if (!groupFilter) {
    return [] as Stampbox[];
  }

  const rows = await fetchCollection<Stampbox>(accessToken, 'Stampboxes', [
    [
      '$select',
      'ID,number,orderBy,name,description,image,latitude,longitude,hasVisited,totalGroupStampings,stampedUsers,stampedUserIds,groupFilterStampings',
    ],
    ['$skip', 0],
    ['$top', 250],
    ['$orderby', 'orderBy asc'],
    ['$filter', `groupFilterStampings ne '${escapeODataString(groupFilter)}'`],
  ]);

  return rows.slice().sort((left, right) => {
    const leftKey = left.orderBy || left.number || '';
    const rightKey = right.orderBy || right.number || '';
    return leftKey.localeCompare(rightKey, undefined, { numeric: true });
  });
}

async function fetchGuidFilteredCollection<T>(
  accessToken: string,
  entitySet: string,
  field: string,
  id: string,
  query?: [string, string | number | boolean | undefined][]
) {
  const filters = [`${field} eq ${id}`, `${field} eq guid'${id}'`];

  for (const filter of filters) {
    try {
      return await fetchCollection<T>(accessToken, entitySet, [
        ...(query ?? []),
        ['$filter', filter],
      ]);
    } catch {
      continue;
    }
  }

  return [];
}

function estimateMinutes(distanceKm: number | null) {
  if (distanceKm === null) {
    return null;
  }

  return Math.max(1, Math.round((distanceKm / 4) * 60));
}

function getVisitTimestamp(stamping: Stamping) {
  return stamping.visitedAt || stamping.createdAt;
}

function safeTrim(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNormalizedText(value: unknown) {
  return safeTrim(value).toLowerCase();
}

function tokenizeFriendField(value?: string | string[] | number | null) {
  if (!value) {
    return [];
  }

  const parts = Array.isArray(value) ? value : String(value).split(/[;,|]/);

  return parts.map((part) => safeNormalizedText(part)).filter(Boolean);
}

function stampContainsUserId(stamp: Stampbox, userId: string) {
  const normalizedUserId = safeNormalizedText(userId);
  if (!normalizedUserId) {
    return false;
  }

  return tokenizeFriendField(stamp.stampedUserIds).includes(normalizedUserId);
}

function stampContainsUserName(stamp: Stampbox, name?: string) {
  const normalizedName = safeNormalizedText(name);
  if (!normalizedName) {
    return false;
  }

  return tokenizeFriendField(stamp.stampedUsers).includes(normalizedName);
}

function stampContainsUser(stamp: Stampbox, user: { ID: string; name?: string }) {
  return stampContainsUserId(stamp, user.ID) || stampContainsUserName(stamp, user.name);
}

export async function fetchStampboxes(accessToken: string) {
  const rows = await fetchCollection<Stampbox>(accessToken, 'Stampboxes', [
    [
      '$select',
      'ID,number,orderBy,name,description,image,latitude,longitude,hasVisited,totalGroupStampings,stampedUsers,stampedUserIds',
    ],
    ['$orderby', 'orderBy asc'],
    ['$top', 500],
  ]);

  return rows.slice().sort((left, right) => {
    const leftKey = left.orderBy || left.number || '';
    const rightKey = right.orderBy || right.number || '';
    return leftKey.localeCompare(rightKey, undefined, { numeric: true });
  });
}

export async function fetchMapData(accessToken: string, currentUserId?: string) {
  const [stamps, parkingSpots, myStampings] = await Promise.all([
    fetchStampboxes(accessToken),
    fetchCollection<ParkingSpot>(accessToken, 'ParkingSpots', [
      ['$select', 'ID,name,description,image,latitude,longitude'],
      ['$top', 500],
    ]),
    currentUserId
      ? fetchCollection<Stamping>(accessToken, 'Stampings', [
          ['$select', 'ID,visitedAt,createdAt,createdBy,stamp_ID'],
          ['$filter', `createdBy eq '${escapeODataString(currentUserId)}'`],
          ['$orderby', 'visitedAt desc,createdAt desc'],
          ['$top', 1000],
        ])
      : Promise.resolve([] as Stamping[]),
  ]);

  const latestVisitByStampId = new Map<string, string>();
  for (const stamping of myStampings) {
    if (!stamping.stamp_ID) {
      continue;
    }

    const visitTimestamp = getVisitTimestamp(stamping);
    const currentTimestamp = latestVisitByStampId.get(stamping.stamp_ID);
    if (!visitTimestamp) {
      continue;
    }

    if (!currentTimestamp || new Date(visitTimestamp).getTime() > new Date(currentTimestamp).getTime()) {
      latestVisitByStampId.set(stamping.stamp_ID, visitTimestamp);
    }
  }

  return {
    stamps: stamps.map((stamp) => {
      const visitedAt = latestVisitByStampId.get(stamp.ID);
      const hasVisited = Boolean(stamp.hasVisited || visitedAt);

      return {
        ...stamp,
        hasVisited,
        visitedAt,
        kind: hasVisited ? ('visited-stamp' as const) : ('open-stamp' as const),
      };
    }),
    parkingSpots: parkingSpots.map((parkingSpot) => ({
      ...parkingSpot,
      kind: 'parking' as const,
    })),
  } satisfies MapData;
}

export async function fetchLatestVisitedStamp(accessToken: string, currentUserId?: string) {
  if (!currentUserId) {
    return null;
  }

  const latestStamping = await fetchCollection<Stamping>(accessToken, 'Stampings', [
    ['$select', 'ID,visitedAt,createdAt,createdBy,stamp_ID'],
    ['$filter', `createdBy eq '${escapeODataString(currentUserId)}'`],
    ['$orderby', 'visitedAt desc,createdAt desc'],
    ['$top', 1],
  ]);

  const latestVisit = latestStamping[0];
  if (!latestVisit?.stamp_ID) {
    return null;
  }

  const stamp = await fetchEntityById<Stampbox>(accessToken, 'Stampboxes', latestVisit.stamp_ID, [
    ['$select', 'ID,number,name'],
  ]);

  return {
    stampId: stamp.ID,
    stampNumber: stamp.number,
    stampName: stamp.name || 'Stempelstelle',
    visitedAt: getVisitTimestamp(latestVisit),
  } satisfies LatestVisitedStamp;
}

export async function fetchCurrentUserProfile(accessToken: string) {
  const currentUser = await fetchCurrentUserRecord(accessToken);

  return {
    id: currentUser.ID,
    name: currentUser.name || currentUser.ID,
    picture: currentUser.picture,
  } satisfies CurrentUserProfileData;
}

export async function fetchStampDetail(accessToken: string, stampId: string, currentUserId?: string) {
  const stamp = await fetchEntityById<Stampbox>(accessToken, 'Stampboxes', stampId, [
    [
      '$select',
      'ID,number,orderBy,name,description,image,latitude,longitude,hasVisited,totalGroupStampings,stampedUsers,stampedUserIds',
    ],
  ]);

  const [neighborStampRows, neighborParkingRows, stampings, friends] = await Promise.all([
    fetchGuidFilteredCollection<NeighborStampRow>(accessToken, 'NeighborsStampStamp', 'ID', stampId, [
      ['$orderby', 'distanceKm asc'],
      ['$top', 3],
    ]),
    fetchGuidFilteredCollection<NeighborParkingRow>(accessToken, 'NeighborsStampParking', 'ID', stampId, [
      ['$orderby', 'distanceKm asc'],
      ['$top', 3],
    ]),
    fetchGuidFilteredCollection<Stamping>(accessToken, 'Stampings', 'stamp_ID', stampId, [
      ['$select', 'ID,visitedAt,createdAt,createdBy,stamp_ID'],
      ['$orderby', 'visitedAt desc,createdAt desc'],
      ['$top', 20],
    ]),
    fetchCollection<MyFriend>(accessToken, 'MyFriends', [['$select', 'ID,name,picture']]),
  ]);

  const nearbyStamps = (
    await Promise.all(
      neighborStampRows.map(async (neighbor) => {
        try {
          const relatedStamp = await fetchEntityById<Stampbox>(
            accessToken,
            'Stampboxes',
            neighbor.NeighborsID,
            [['$select', 'ID,number,name']]
          );

          return {
            ID: relatedStamp.ID,
            number: relatedStamp.number,
            name: relatedStamp.name,
            distanceKm: typeof neighbor.distanceKm === 'number' ? neighbor.distanceKm : null,
            durationMinutes: estimateMinutes(
              typeof neighbor.distanceKm === 'number' ? neighbor.distanceKm : null
            ),
          };
        } catch {
          return {
            ID: neighbor.NeighborsID,
            number: neighbor.NeighborsNumber,
            name: `${neighbor.NeighborsNumber || ''}`.trim(),
            distanceKm: typeof neighbor.distanceKm === 'number' ? neighbor.distanceKm : null,
            durationMinutes: estimateMinutes(
              typeof neighbor.distanceKm === 'number' ? neighbor.distanceKm : null
            ),
          };
        }
      })
    )
  ).filter((item) => item.ID !== stamp.ID);

  const nearbyParking = await Promise.all(
    neighborParkingRows.map(async (neighbor) => {
      try {
        const parking = await fetchEntityById<ParkingSpot>(
          accessToken,
          'ParkingSpots',
          neighbor.NeighborsID,
          [['$select', 'ID,name']]
        );

        return {
          ID: parking.ID,
          name: parking.name || 'Parkplatz',
          distanceKm: typeof neighbor.distanceKm === 'number' ? neighbor.distanceKm : null,
          durationMinutes: estimateMinutes(
            typeof neighbor.distanceKm === 'number' ? neighbor.distanceKm : null
          ),
        };
      } catch {
        return {
          ID: neighbor.NeighborsID,
          name: 'Parkplatz',
          distanceKm: typeof neighbor.distanceKm === 'number' ? neighbor.distanceKm : null,
          durationMinutes: estimateMinutes(
            typeof neighbor.distanceKm === 'number' ? neighbor.distanceKm : null
          ),
        };
      }
    })
  );

  const friendMap = new Map(friends.map((friend) => [friend.ID, friend]));
  const myVisits = stampings.filter((stamping) => stamping.createdBy === currentUserId);

  const friendVisits = stampings
    .filter((stamping) => stamping.createdBy && stamping.createdBy !== currentUserId)
    .map((stamping) => {
      const friend = stamping.createdBy ? friendMap.get(stamping.createdBy) : undefined;
      return {
        id: stamping.ID,
        name: friend?.name || stamping.createdBy || 'Freund',
        createdAt: getVisitTimestamp(stamping),
      };
    })
    .slice(0, 5);

  return {
    stamp,
    nearbyStamps,
    nearbyParking,
    friendVisits,
    myVisits,
  } satisfies StampDetailData;
}

export async function fetchProfileOverview(accessToken: string, currentUserId?: string) {
  const [currentUser, stamps, stampings, friends] = await Promise.all([
    fetchCurrentUserRecord(accessToken),
    fetchStampboxes(accessToken),
    fetchCollection<Stamping>(accessToken, 'Stampings', [
      ['$select', 'ID,visitedAt,createdAt,createdBy,stamp_ID'],
      ['$orderby', 'visitedAt desc,createdAt desc'],
      ['$top', 100],
    ]),
    fetchCollection<MyFriend>(accessToken, 'MyFriends', [['$select', 'ID,name,picture']]),
  ]);

  const stampMap = new Map(stamps.map((stamp) => [stamp.ID, stamp]));
  const myStampings = currentUserId
    ? stampings.filter((stamping) => stamping.createdBy === currentUserId)
    : [];
  const sortedVisits = myStampings
    .slice()
    .sort((left, right) => {
      const leftTime = getVisitTimestamp(left);
      const rightTime = getVisitTimestamp(right);
      return new Date(rightTime || 0).getTime() - new Date(leftTime || 0).getTime();
    });
  const latestVisits = sortedVisits.slice(0, 3).map((visit) => {
    const stamp = visit.stamp_ID ? stampMap.get(visit.stamp_ID) : undefined;
    return {
      id: visit.ID,
      stampId: visit.stamp_ID || '',
      stampNumber: stamp?.number,
      stampName: stamp?.name || 'Stempelstelle',
      visitedAt: getVisitTimestamp(visit),
    };
  });

  const earliestVisit = sortedVisits[sortedVisits.length - 1];
  const visitedCount = stamps.filter((stamp) => stamp.hasVisited).length;
  const totalCount = stamps.length;
  const openCount = Math.max(0, totalCount - visitedCount);
  const completionPercent = totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : 0;
  const mappedFriends = await buildFriendProgress(accessToken, friends, totalCount);
  const featuredFriend = mappedFriends[0]
    ? {
        id: mappedFriends[0].id,
        name: mappedFriends[0].name,
        picture: mappedFriends[0].picture,
        visitedCount: mappedFriends[0].visitedCount,
        completionPercent: mappedFriends[0].completionPercent,
      }
    : null;
  return {
    name: currentUser.name || currentUser.ID,
    picture: currentUser.picture,
    visitedCount,
    totalCount,
    openCount,
    completionPercent,
    friendCount: friends.length,
    collectorSinceYear: earliestVisit ? new Date(getVisitTimestamp(earliestVisit) || '').getFullYear() : null,
    latestVisits,
    featuredFriend,
    friends: mappedFriends,
    stamps,
    achievements: [
      {
        id: 'forest-runner',
        label: 'Waldlaeufer',
        value: `${visitedCount} Stempel`,
      },
      {
        id: 'early-starter',
        label: 'Fruehstarter',
        value: `${myStampings.length} Besuche`,
      },
    ],
  } satisfies ProfileOverviewData;
}

export async function fetchUserProfileOverview(accessToken: string, targetUserId: string) {
  const [targetUser, currentUser] = await Promise.all([
    fetchStringEntityById<User>(accessToken, 'Users', 'ID', targetUserId, [['$select', 'ID,name,picture,isFriend']]),
    fetchOData<User>(accessToken, buildUrl('getCurrentUser()')),
  ]);

  const [stamps, comparisonStamps, targetStampings, friends, pendingRequests, visibleFriends] =
    await Promise.all([
      fetchStampboxes(accessToken),
      fetchComparisonStampboxes(accessToken, [currentUser.ID, targetUserId]),
      fetchCollection<Stamping>(accessToken, 'Stampings', [
        ['$select', 'ID,createdAt,createdBy,stamp_ID'],
        ['$filter', `createdBy eq '${escapeODataString(targetUserId)}'`],
        ['$orderby', 'createdAt desc'],
        ['$top', 200],
      ]),
      fetchCollection<MyFriend>(accessToken, 'MyFriends', [
        ['$select', 'ID,name,picture,FriendshipID,isAllowedToStampForMe,isAllowedToStampForFriend'],
      ]),
      fetchCollection<PendingFriendshipRequest>(accessToken, 'PendingFriendshipRequests', [
        ['$select', 'ID,fromUser_ID,toUser_ID,outgoingFriendship_ID'],
        ['$expand', 'fromUser($select=ID,name,picture),toUser($select=ID,name,picture)'],
      ]),
      fetchUserFriends(accessToken, targetUserId),
    ]);

  if (currentUser.ID === targetUser.ID) {
    return {
      userId: targetUser.ID,
      name: targetUser.name || targetUser.ID,
      picture: targetUser.picture,
      relationship: 'self',
      friendshipId: null,
      pendingRequestId: null,
      isAllowedToStampForMe: false,
      visitedCount: 0,
      completionPercent: 0,
      sharedVisitedCount: 0,
      collectorSinceYear: null,
      latestVisits: [],
      friends: [],
      achievements: [],
      stampBuckets: { shared: 0, friendOnly: 0, meOnly: 0, neither: 0 },
      stampComparisons: [],
    } satisfies UserProfileOverviewData;
  }

  const friendMatch = friends.find((friend) => friend.ID === targetUser.ID);
  const relationship: FriendshipRelationshipState = friendMatch
    ? 'friend'
    : pendingRequests.some(
          (request) => request.fromUser_ID === currentUser.ID && request.toUser_ID === targetUser.ID
        )
      ? 'incoming_request'
      : pendingRequests.some(
            (request) => request.toUser_ID === currentUser.ID && request.fromUser_ID === targetUser.ID
          )
        ? 'outgoing_request'
        : 'not_connected';

  const friendshipId =
    friendMatch?.FriendshipID || null;

  const pendingRequestId =
    pendingRequests.find(
      (request) =>
        (request.fromUser_ID === currentUser.ID && request.toUser_ID === targetUser.ID) ||
        (request.toUser_ID === currentUser.ID && request.fromUser_ID === targetUser.ID)
    )?.ID || null;

  const targetVisitedCount = stamps.reduce(
    (count, stamp) => count + (stampContainsUser(stamp, targetUser) ? 1 : 0),
    0
  );
  const sharedVisitedCount = stamps.reduce(
    (count, stamp) => count + (Boolean(stamp.hasVisited) && stampContainsUser(stamp, targetUser) ? 1 : 0),
    0
  );
  const totalCount = stamps.length;
  const latestVisits = targetStampings.slice(0, 3).map((visit) => {
    const stamp = visit.stamp_ID ? stamps.find((item) => item.ID === visit.stamp_ID) : undefined;
    return {
      id: visit.ID,
      stampId: visit.stamp_ID || '',
      stampNumber: stamp?.number,
      stampName: stamp?.name || 'Stempelstelle',
      visitedAt: visit.createdAt,
    };
  });

  const earliestVisit = targetStampings[targetStampings.length - 1];
  const mappedVisibleFriends = await buildFriendProgress(
    accessToken,
    visibleFriends.map((friend) => ({
      ID: friend.ID,
      name: friend.name,
      picture: friend.picture,
    })),
    totalCount
  );
  const stampComparisons = comparisonStamps.map((stamp) => ({
    stamp,
    meVisited: !!stamp.hasVisited,
    userVisited: stampContainsUser(stamp, targetUser),
  }));

  return {
    userId: targetUser.ID,
    name: targetUser.name || targetUser.ID,
    picture: targetUser.picture,
    relationship,
    friendshipId,
    pendingRequestId,
    isAllowedToStampForMe: !!friendMatch?.isAllowedToStampForMe,
    visitedCount: targetVisitedCount,
    completionPercent: totalCount > 0 ? Math.round((targetVisitedCount / totalCount) * 100) : 0,
    sharedVisitedCount,
    collectorSinceYear: earliestVisit ? new Date(earliestVisit.createdAt || '').getFullYear() : null,
    latestVisits,
    friends: mappedVisibleFriends,
    achievements: [
      {
        id: 'forest-runner',
        label: 'Waldlaeufer',
        value: `${targetVisitedCount} Stempel`,
      },
      {
        id: 'shared-hikes',
        label: 'Gemeinsam',
        value: `${sharedVisitedCount} zusammen`,
      },
    ],
    stampBuckets: {
      shared: stampComparisons.filter((item) => item.meVisited && item.userVisited).length,
      friendOnly: stampComparisons.filter((item) => !item.meVisited && item.userVisited).length,
      meOnly: stampComparisons.filter((item) => item.meVisited && !item.userVisited).length,
      neither: stampComparisons.filter((item) => !item.meVisited && !item.userVisited).length,
    },
    stampComparisons,
  } satisfies UserProfileOverviewData;
}

export async function fetchFriendsOverview(accessToken: string) {
  const [stamps, friends, currentUser, pendingRequests] = await Promise.all([
    fetchStampboxes(accessToken),
    fetchCollection<MyFriend>(accessToken, 'MyFriends', [
      ['$select', 'ID,name,picture,FriendshipID,isAllowedToStampForMe,isAllowedToStampForFriend'],
    ]),
    fetchOData<User>(accessToken, buildUrl('getCurrentUser()')),
    fetchCollection<PendingFriendshipRequest>(accessToken, 'PendingFriendshipRequests', [
      ['$select', 'ID,fromUser_ID,toUser_ID,outgoingFriendship_ID'],
      ['$expand', 'fromUser($select=ID,name,picture),toUser($select=ID,name,picture)'],
    ]),
  ]);

  const totalCount = stamps.length;
  const mappedFriends = await buildFriendProgress(accessToken, friends, totalCount);

  const currentUserId = currentUser.ID;
  const incomingRequests = pendingRequests
    .filter((request) => request.fromUser_ID === currentUserId)
    .map((request) => ({
      id: request.ID,
      pendingRequestId: request.ID,
      userId: request.toUser_ID || request.toUser?.ID || request.ID,
      name: request.toUser?.name || 'Unbekannter Nutzer',
      picture: request.toUser?.picture,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const outgoingRequests = pendingRequests
    .filter((request) => request.toUser_ID === currentUserId)
    .map((request) => ({
      id: request.ID,
      pendingRequestId: request.ID,
      userId: request.fromUser_ID || request.fromUser?.ID || request.ID,
      name: request.fromUser?.name || 'Unbekannter Nutzer',
      picture: request.fromUser?.picture,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    currentUserId,
    friendCount: mappedFriends.length,
    incomingRequestCount: incomingRequests.length,
    outgoingRequestCount: outgoingRequests.length,
    friends: mappedFriends,
    incomingRequests,
    outgoingRequests,
  } satisfies FriendsOverviewData;
}

export async function acceptPendingFriendshipRequest(accessToken: string, pendingRequestId: string) {
  return mutateOData<string>(accessToken, buildUrl('acceptPendingFriendshipRequest'), {
    method: 'POST',
    body: JSON.stringify({
      FriendshipID: pendingRequestId,
    }),
  });
}

export async function searchUsers(accessToken: string, rawQuery: string) {
  const query = rawQuery.trim();
  if (!query) {
    return [] as SearchUserResult[];
  }

  const escapedQuery = escapeODataString(query);
  const filters = [
    `contains(name,'${escapedQuery}') or contains(ID,'${escapedQuery}')`,
    `startswith(name,'${escapedQuery}') or startswith(ID,'${escapedQuery}')`,
  ];

  for (const filter of filters) {
    try {
      const users = await fetchCollection<User>(accessToken, 'Users', [
        ['$select', 'ID,name,picture,isFriend'],
        ['$filter', filter],
        ['$top', 12],
      ]);

      return users.map((user) => ({
        id: user.ID,
        name: user.name || user.ID,
        picture: user.picture,
        isFriend: !!user.isFriend,
      }));
    } catch {
      continue;
    }
  }

  const users = await fetchCollection<User>(accessToken, 'Users', [
    ['$select', 'ID,name,picture,isFriend'],
    ['$top', 50],
  ]);

  const normalizedQuery = query.toLowerCase();
  return users
    .filter((user) => {
      const name = (user.name || '').toLowerCase();
      const id = user.ID.toLowerCase();
      return name.includes(normalizedQuery) || id.includes(normalizedQuery);
    })
    .slice(0, 12)
    .map((user) => ({
      id: user.ID,
      name: user.name || user.ID,
      picture: user.picture,
      isFriend: !!user.isFriend,
    }));
}

export async function createFriendRequest(accessToken: string, userId: string) {
  return mutateOData<string>(accessToken, buildUrl('Friendships'), {
    method: 'POST',
    body: JSON.stringify({
      toUser_ID: userId,
    }),
  });
}

export async function updateCurrentUserProfile(
  accessToken: string,
  updates: {
    name?: string;
    picture?: string;
  }
) {
  const currentUser = await fetchCurrentUserRecord(accessToken);

  return mutateOData<User>(accessToken, buildUrl(buildStringKeyPath('Users', currentUser.ID)), {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function uploadAttachment(
  accessToken: string,
  file: {
    uri: string;
    fileName: string;
    mimeType: string;
  }
) {
  const attachment = await mutateOData<Attachment>(accessToken, buildUrl('Attachments'), {
    method: 'POST',
    body: JSON.stringify({
      filename: file.fileName,
      mimeType: file.mimeType,
    }),
  });

  const fileResponse = await fetch(file.uri);
  const fileBlob = await fileResponse.blob();
  const contentUrl = buildV2Url(`Attachments/${attachment.ID}/content`);
  const uploadResponse = await fetch(contentUrl, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': file.mimeType,
    },
    body: fileBlob,
  });

  if (uploadResponse.status === 401 || uploadResponse.status === 403) {
    const error = new Error('Unauthorized');
    error.name = 'UnauthorizedError';
    throw error;
  }

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    throw new Error(errorBody || `Request failed with status ${uploadResponse.status}`);
  }

  return {
    id: attachment.ID,
    url: contentUrl,
  };
}

export async function updateFriendshipPermission(
  accessToken: string,
  friendshipId: string,
  isAllowedToStampForFriend: boolean
) {
  return mutateOData<string>(accessToken, buildUrl(`Friendships(${friendshipId})`), {
    method: 'PATCH',
    body: JSON.stringify({
      isAllowedToStampForFriend,
    }),
  });
}

export async function removeFriendship(accessToken: string, friendshipId: string) {
  return mutateOData<null>(accessToken, buildUrl(`Friendships(${friendshipId})`), {
    method: 'DELETE',
  });
}

export async function createStamping(accessToken: string, stampId: string) {
  return mutateOData<Stamping>(accessToken, buildUrl('Stampings'), {
    method: 'POST',
    body: JSON.stringify({
      stamp: {
        ID: stampId,
      },
    }),
  });
}

export async function updateStamping(accessToken: string, stampingId: string, visitedAt: string) {
  return mutateOData<Stamping>(accessToken, buildUrl(`Stampings(${stampingId})`), {
    method: 'PATCH',
    body: JSON.stringify({
      visitedAt,
    }),
  });
}

export async function deleteStamping(accessToken: string, stampingId: string) {
  return mutateOData<null>(accessToken, buildUrl(`Stampings(${stampingId})`), {
    method: 'DELETE',
  });
}
