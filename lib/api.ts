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

type ParkingSpot = {
  ID: string;
  name?: string;
  description?: string;
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
};

type PendingFriendshipRequest = {
  ID: string;
  fromUser_ID?: string;
  toUser_ID?: string;
  outgoingFriendship_ID?: string;
  fromUser?: User;
  toUser?: User;
};

export type ProfileOverviewData = {
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
  stamps: Stampbox[];
  achievements: Array<{
    id: string;
    label: string;
    value: string;
  }>;
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
    friendshipId: string;
    userId: string;
    name: string;
    picture?: string;
  }>;
  outgoingRequests: Array<{
    id: string;
    friendshipId: string;
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

function tokenizeFriendField(value?: string | string[] | number | null) {
  if (!value) {
    return [];
  }

  const parts = Array.isArray(value) ? value : String(value).split(/[;,|]/);

  return parts.map((part) => String(part).trim().toLowerCase()).filter(Boolean);
}

function stampContainsFriend(stamp: Stampbox, friend: MyFriend) {
  const friendId = friend.ID.trim().toLowerCase();
  const friendName = (friend.name || '').trim().toLowerCase();
  const stampedUserIds = tokenizeFriendField(stamp.stampedUserIds);
  const stampedUsers = tokenizeFriendField(stamp.stampedUsers);

  if (friendId && stampedUserIds.includes(friendId)) {
    return true;
  }

  if (friendName && stampedUsers.includes(friendName)) {
    return true;
  }

  return false;
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
  const [stamps, stampings, friends] = await Promise.all([
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
  const featuredFriend = friends.length
    ? {
        id: friends[0].ID,
        name: friends[0].name || 'Freund',
        picture: friends[0].picture,
        visitedCount: null,
        completionPercent: null,
      }
    : null;
  return {
    visitedCount,
    totalCount,
    openCount,
    completionPercent,
    friendCount: friends.length,
    collectorSinceYear: earliestVisit ? new Date(getVisitTimestamp(earliestVisit) || '').getFullYear() : null,
    latestVisits,
    featuredFriend,
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
  const mappedFriends = friends
    .map((friend) => {
      const visitedCount = stamps.reduce((count, stamp) => {
        return count + (stampContainsFriend(stamp, friend) ? 1 : 0);
      }, 0);

      return {
        id: friend.ID,
        name: friend.name || 'Freund',
        picture: friend.picture,
        visitedCount,
        completionPercent: totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : 0,
      };
    })
    .sort((left, right) => right.visitedCount - left.visitedCount || left.name.localeCompare(right.name));

  const currentUserId = currentUser.ID;
  const incomingRequests = pendingRequests
    .filter((request) => request.toUser_ID === currentUserId)
    .map((request) => ({
      id: request.ID,
      friendshipId: request.outgoingFriendship_ID || request.ID,
      userId: request.fromUser_ID || request.fromUser?.ID || request.ID,
      name: request.fromUser?.name || 'Unbekannter Nutzer',
      picture: request.fromUser?.picture,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const outgoingRequests = pendingRequests
    .filter((request) => request.fromUser_ID === currentUserId)
    .map((request) => ({
      id: request.ID,
      friendshipId: request.outgoingFriendship_ID || request.ID,
      userId: request.toUser_ID || request.toUser?.ID || request.ID,
      name: request.toUser?.name || 'Unbekannter Nutzer',
      picture: request.toUser?.picture,
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

export async function acceptPendingFriendshipRequest(accessToken: string, friendshipId: string) {
  return mutateOData<string>(accessToken, buildUrl('acceptPendingFriendshipRequest'), {
    method: 'POST',
    body: JSON.stringify({
      FriendshipID: friendshipId,
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
