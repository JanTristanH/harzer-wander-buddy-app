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
  stampedUsers?: string;
  stampedUserIds?: string;
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
  createdAt?: string;
  createdBy?: string;
  stamp_ID?: string;
};

type MyFriend = {
  ID: string;
  name?: string;
  picture?: string;
};

export type StampDetailData = {
  stamp: Stampbox;
  nearbyStamps: Array<{
    ID: string;
    number?: string;
    name: string;
    distanceKm: number | null;
    durationMinutes: number | null;
  }>;
  nearbyParking: Array<{
    ID: string;
    name: string;
    distanceKm: number | null;
    durationMinutes: number | null;
  }>;
  friendVisits: Array<{
    id: string;
    name: string;
    createdAt?: string;
  }>;
  myVisits: Stamping[];
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function buildQuery(query?: Array<[string, string | number | boolean | undefined]>) {
  if (!query) {
    return '';
  }

  const parts = query
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function buildUrl(path: string, query?: Array<[string, string | number | boolean | undefined]>) {
  return `${normalizeBaseUrl(appConfig.backendUrl)}/odata/v4/api/${path}${buildQuery(query)}`;
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

async function fetchCollection<T>(
  accessToken: string,
  entitySet: string,
  query?: Array<[string, string | number | boolean | undefined]>
) {
  const payload = await fetchOData<ODataCollection<T>>(accessToken, buildUrl(entitySet, query));
  return payload.value ?? [];
}

async function fetchEntityById<T>(
  accessToken: string,
  entitySet: string,
  id: string,
  query?: Array<[string, string | number | boolean | undefined]>
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
  query?: Array<[string, string | number | boolean | undefined]>
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
      ['$select', 'ID,createdAt,createdBy,stamp_ID'],
      ['$orderby', 'createdAt desc'],
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
            name: `Stempel ${neighbor.NeighborsNumber || ''}`.trim(),
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
        createdAt: stamping.createdAt,
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
