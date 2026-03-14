import { appConfig } from '@/lib/config';

export type Stampbox = {
  ID: string;
  number: string;
  orderBy?: string;
  name: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  hasVisited?: boolean;
  totalGroupStampings?: number;
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function buildStampboxesUrl() {
  const query = [
    [
      '$select',
      'ID,number,orderBy,name,description,latitude,longitude,hasVisited,totalGroupStampings',
    ],
    ['$orderby', 'orderBy asc'],
    ['$top', '500'],
  ]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return `${normalizeBaseUrl(appConfig.backendUrl)}/odata/v4/api/Stampboxes?${query}`;
}

export async function fetchStampboxes(accessToken: string) {
  const response = await fetch(buildStampboxesUrl(), {
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

  const payload = (await response.json()) as { value?: Stampbox[] };
  return (payload.value ?? []).slice().sort((left, right) => {
    const leftKey = left.orderBy || left.number || '';
    const rightKey = right.orderBy || right.number || '';
    return leftKey.localeCompare(rightKey, undefined, { numeric: true });
  });
}
