import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Image,
  type ImageSourcePropType,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { HttpStatusError, type Tour, type TourUpdateResponse } from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';
import { buildAuthenticatedImageSource } from '@/lib/images';
import { getPreGeneratedMapMarkerImageSource } from '@/lib/map-marker-images.generated';
import {
  useDeleteTourMutation,
  useMapDataQuery,
  usePreviewTourByPOIListMutation,
  usePointsOfInterestQuery,
  useTourDetailQuery,
  useUpdateTourByPOIListMutation,
  useUpdateTourNameMutation,
} from '@/lib/queries';

const HARZ_REGION: Region = {
  latitude: 51.7544,
  longitude: 10.6182,
  latitudeDelta: 0.42,
  longitudeDelta: 0.42,
};

const MAP_EDGE_PADDING = {
  top: 70,
  right: 70,
  bottom: 70,
  left: 70,
};

const MIN_ZOOM_DELTA = 0.008;
const MAX_ZOOM_DELTA = 1.2;
const SEARCH_RESULT_LIMIT = 5;
const PREVIEW_DEBOUNCE_MS = 700;
const DIGITS_ONLY_PATTERN = /^\d+$/;
const STAMP_TOKEN_PATTERN = /\b(?:[A-Za-z]{1,3}\d{1,4}|\d{1,4}[A-Za-z]{1,3}|\d{1,4}|[A-Za-z]{1,3})\b/g;
const STAMP_TOKEN_IGNORED = new Set(['P', 'POI']);

type Coordinate = {
  latitude: number;
  longitude: number;
};

type TourMapMarkerKind = 'visited-stamp' | 'open-stamp' | 'parking' | 'poi';

type TourMapItem = {
  ID: string;
  name: string;
  typeLabel: string;
  markerLabel: string;
  stampNumber?: string;
  kind: TourMapMarkerKind;
  latitude: number;
  longitude: number;
  description?: string;
  imageUrl?: string;
};

type LiveTourMetrics = {
  distance: number | null;
  duration: number | null;
  stampCount: number | null;
  totalElevationGain: number | null;
  totalElevationLoss: number | null;
};

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

type SearchCandidate = TourMapItem & {
  distanceKm: number;
};

type SearchResultRank = {
  matchTier: number;
  matchIndex: number;
  numberDelta: number;
  nameLength: number;
};

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) {
    return '-- km';
  }

  return `${(distanceMeters / 1000).toFixed(1).replace('.', ',')} km`;
}

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) {
    return '--:-- h';
  }

  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours}:${String(minutes).padStart(2, '0')} h`;
}

function formatElevation(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '-- m';
  }

  return `${Math.round(value)} m`;
}

function formatDistanceKm(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) {
    return '-- km';
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }

  return `${distanceKm.toFixed(1).replace('.', ',')} km`;
}

function formatAlphabeticOrder(position: number) {
  if (!Number.isFinite(position) || position <= 0) {
    return '?';
  }

  let value = Math.floor(position);
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }

  return label;
}

function resolveRouteOrderLabel(positions: number[]) {
  const labels = Array.from(
    new Set(
      [...positions]
        .filter((position) => Number.isFinite(position) && position > 0)
        .sort((left, right) => left - right)
        .map((position) => formatAlphabeticOrder(position))
    )
  );

  if (labels.length === 0) {
    return '--';
  }

  if (labels.length === 1) {
    return labels[0];
  }

  return labels.join('/');
}

function resolveRouteOrderImageLabel(routeOrderLabel: string) {
  const trimmed = routeOrderLabel.trim().toUpperCase();
  if (!trimmed || trimmed === '--') {
    return '--';
  }

  const compact = trimmed.replaceAll('/', '');
  if (/^[A-Z]{1,3}$/.test(compact)) {
    return compact;
  }

  return '--';
}

function hasCoordinate(value?: { latitude?: number; longitude?: number }): value is Coordinate {
  return typeof value?.latitude === 'number' && typeof value?.longitude === 'number';
}

function cleanText(value?: string | null) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeUserId(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function derivePoiSequence(
  path: {
    rank: number;
    travelTime?: {
      fromPoi?: string;
      toPoi?: string;
    };
  }[]
) {
  const sorted = [...path].sort((left, right) => left.rank - right.rank);
  const result: string[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const entry = sorted[index];
    const fromPoi = entry.travelTime?.fromPoi?.trim();
    const toPoi = entry.travelTime?.toPoi?.trim();

    if (index === 0 && fromPoi) {
      result.push(fromPoi);
    }

    if (toPoi) {
      result.push(toPoi);
    }
  }

  return result;
}

function clampDelta(value: number) {
  return Math.min(MAX_ZOOM_DELTA, Math.max(MIN_ZOOM_DELTA, value));
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function normalizeStampToken(value?: string | null) {
  const normalized = cleanText(value);
  if (!normalized) {
    return null;
  }

  const upper = normalized.toUpperCase();
  if (upper === '--' || STAMP_TOKEN_IGNORED.has(upper)) {
    return null;
  }

  if (/^\d{1,4}$/.test(upper)) {
    const parsed = Number.parseInt(upper, 10);
    return Number.isFinite(parsed) ? String(parsed) : null;
  }

  if (/^[A-Z]{1,3}$/.test(upper)) {
    return upper;
  }

  if (/^[A-Z]{1,3}\d{1,4}$/.test(upper) || /^\d{1,4}[A-Z]{1,3}$/.test(upper)) {
    return upper;
  }

  return null;
}

function extractStampToken(value?: string | null) {
  const direct = normalizeStampToken(value);
  if (direct) {
    return direct;
  }

  const normalized = cleanText(value);
  if (!normalized) {
    return null;
  }

  const matches = normalized.match(STAMP_TOKEN_PATTERN);
  if (!matches || matches.length === 0) {
    return null;
  }

  const tokens = matches
    .map((token) => normalizeStampToken(token))
    .filter((token): token is string => Boolean(token));

  if (tokens.length === 0) {
    return null;
  }

  const tokenWithDigits = tokens.find((token) => /\d/.test(token));
  return tokenWithDigits ?? tokens[0];
}

function inferStampNumberFromPoi(poi: {
  stampNumber?: string;
  poiType?: string;
  name?: string;
  orderBy?: string;
}) {
  const explicit = extractStampToken(poi.stampNumber);
  if (explicit) {
    return explicit;
  }

  const byOrder = extractStampToken(poi.orderBy);
  if (byOrder) {
    return byOrder;
  }

  const normalizedType = normalizeSearchValue(poi.poiType || '');
  const normalizedName = normalizeSearchValue(poi.name || '');
  const looksLikeStamp =
    normalizedType.includes('stempel') ||
    normalizedType.includes('stamp') ||
    normalizedName.includes('stempel') ||
    normalizedName.includes('stamp');

  if (!looksLikeStamp) {
    return null;
  }

  return extractStampToken(poi.name);
}

function haversineDistanceKm(from: Coordinate, to: Coordinate) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRad(to.latitude - from.latitude);
  const deltaLng = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function createLiveTourMetrics(tour: Tour): LiveTourMetrics {
  return {
    distance: tour.distance,
    duration: tour.duration,
    stampCount: tour.stampCount,
    totalElevationGain: tour.totalElevationGain,
    totalElevationLoss: tour.totalElevationLoss,
  };
}

function updateMetricsFromResponse(current: LiveTourMetrics, response: TourUpdateResponse): LiveTourMetrics {
  return {
    distance: response.distance ?? current.distance,
    duration: response.duration ?? current.duration,
    stampCount: response.stampCount ?? current.stampCount,
    totalElevationGain: response.totalElevationGain ?? current.totalElevationGain,
    totalElevationLoss: response.totalElevationLoss ?? current.totalElevationLoss,
  };
}

function createEmptyLiveTourMetrics(): LiveTourMetrics {
  return {
    distance: null,
    duration: null,
    stampCount: null,
    totalElevationGain: null,
    totalElevationLoss: null,
  };
}

function rankSearchItem(item: TourMapItem, normalizedQuery: string): SearchResultRank | null {
  const name = normalizeSearchValue(item.name);
  const description = normalizeSearchValue(item.description ?? '');
  const nameIndex = name.indexOf(normalizedQuery);
  const descriptionIndex = description.indexOf(normalizedQuery);

  if (nameIndex < 0 && descriptionIndex < 0) {
    return null;
  }

  const normalizedStampNumber = normalizeSearchValue(item.stampNumber || '');
  const normalizedMarkerNumber =
    item.kind === 'parking' ? '' : normalizeSearchValue(extractStampToken(item.markerLabel) || '');
  const normalizedNumber = normalizedStampNumber || normalizedMarkerNumber;

  const hasNumericQuery = DIGITS_ONLY_PATTERN.test(normalizedQuery);
  const hasNumericNumber =
    normalizedNumber.length > 0 && DIGITS_ONLY_PATTERN.test(normalizedNumber);
  const queryValue = hasNumericQuery ? Number.parseInt(normalizedQuery, 10) : Number.NaN;
  const numberValue = hasNumericNumber ? Number.parseInt(normalizedNumber, 10) : Number.NaN;
  const numberDelta =
    Number.isFinite(queryValue) && Number.isFinite(numberValue)
      ? Math.abs(numberValue - queryValue)
      : Number.MAX_SAFE_INTEGER;

  if (normalizedNumber && normalizedNumber === normalizedQuery) {
    return { matchTier: 0, matchIndex: 0, numberDelta, nameLength: name.length };
  }

  if (name === normalizedQuery) {
    return { matchTier: 1, matchIndex: 0, numberDelta, nameLength: name.length };
  }

  if (normalizedNumber && normalizedNumber.startsWith(normalizedQuery)) {
    return { matchTier: 2, matchIndex: 0, numberDelta, nameLength: name.length };
  }

  if (nameIndex === 0) {
    return { matchTier: 3, matchIndex: 0, numberDelta, nameLength: name.length };
  }

  if (nameIndex > 0) {
    return { matchTier: 4, matchIndex: nameIndex, numberDelta, nameLength: name.length };
  }

  return { matchTier: 5, matchIndex: descriptionIndex, numberDelta, nameLength: name.length };
}

function getStampNumber(item?: TourMapItem | null) {
  if (!item) {
    return null;
  }

  const explicitStampNumber = extractStampToken(item.stampNumber);
  if (explicitStampNumber) {
    return explicitStampNumber;
  }

  if (
    item.kind !== 'visited-stamp' &&
    item.kind !== 'open-stamp' &&
    item.kind !== 'poi'
  ) {
    return null;
  }

  const markerLabel = extractStampToken(item.markerLabel);
  if (!markerLabel || markerLabel === '--') {
    return null;
  }

  return markerLabel;
}

function getMapItemGradientColors(kind: TourMapMarkerKind): readonly [string, string] {
  if (kind === 'visited-stamp') {
    return ['#4b875f', '#8fd2a4'] as const;
  }

  if (kind === 'open-stamp') {
    return ['#ab8d7d', '#dbc6b7'] as const;
  }

  if (kind === 'parking') {
    return ['#2f7dd7', '#6cb1ff'] as const;
  }

  return ['#5c7f62', '#9fc3a5'] as const;
}

function resolveMapItemImageSource(
  imageUrl: string | undefined,
  accessToken: string | null
): ImageSourcePropType | null {
  if (!imageUrl) {
    return null;
  }

  const source = buildAuthenticatedImageSource(imageUrl, accessToken);
  if (typeof source === 'string') {
    return { uri: source };
  }

  return source;
}

export default function TourDetailScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { accessToken } = useAuth();
  const claims = useIdTokenClaims<{ sub?: string }>();
  const currentUserId = claims?.sub;
  const normalizedCurrentUserId = normalizeUserId(currentUserId);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[]; edit?: string | string[] }>();
  const tourId = Array.isArray(params.id) ? params.id[0] : params.id;
  const editParam = Array.isArray(params.edit) ? params.edit[0] : params.edit;
  const shouldStartInEditMode = editParam === '1' || editParam === 'true';
  const { data, error, isPending, isFetching, refetch } = useTourDetailQuery(tourId);
  const { data: poiData = [], isPending: isPoiPending } = usePointsOfInterestQuery();
  const { data: mapData, isPending: isMapDataPending } = useMapDataQuery();
  const deleteTourMutation = useDeleteTourMutation(tourId);
  const updateTourNameMutation = useUpdateTourNameMutation(tourId);
  const updateTourMutation = useUpdateTourByPOIListMutation(tourId);
  const { mutateAsync: previewTour } = usePreviewTourByPOIListMutation(tourId);

  const [draftPoiIds, setDraftPoiIds] = useState<string[]>([]);
  const [lastPersistedPoiIds, setLastPersistedPoiIds] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [selectedMapItemId, setSelectedMapItemId] = useState<string | null>(null);
  const [poiSearchQuery, setPoiSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapCenter, setMapCenter] = useState<Coordinate>({
    latitude: HARZ_REGION.latitude,
    longitude: HARZ_REGION.longitude,
  });
  const [liveTourMetrics, setLiveTourMetrics] = useState<LiveTourMetrics | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaveErrorCode, setLastSaveErrorCode] = useState<403 | 404 | 422 | null>(null);
  const [blockingErrorCode, setBlockingErrorCode] = useState<403 | 404 | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [tourNameDraft, setTourNameDraft] = useState('');

  const mapRef = useRef<MapView | null>(null);
  const hasAppliedAutoStartEditModeRef = useRef(false);
  const regionRef = useRef<Region>(HARZ_REGION);
  const lastMarkerPressAtRef = useRef(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRequestIdRef = useRef(0);
  const fullscreenProgress = useSharedValue(0);
  const fullscreenAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.94 + fullscreenProgress.value * 0.06 }],
  }));
  const cancelPendingPreview = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    previewRequestIdRef.current += 1;
  }, []);

  const openMapFullscreen = useCallback(() => {
    setIsMapFullscreen(true);
  }, []);

  const closeMapFullscreen = useCallback(() => {
    fullscreenProgress.value = withTiming(
      0,
      {
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(setIsMapFullscreen)(false);
        }
      }
    );
  }, [fullscreenProgress]);

  useEffect(() => {
    if (!tourId) {
      return;
    }

    hasAppliedAutoStartEditModeRef.current = false;
    setHasInitialized(false);
    setBlockingErrorCode(null);
    setLastSaveErrorCode(null);
    setStatusMessage(null);
    setSaveStatus('idle');
    setIsEditMode(false);
  }, [tourId]);

  useEffect(() => {
    return () => {
      cancelPendingPreview();
    };
  }, [cancelPendingPreview]);

  useEffect(() => {
    if (!isMapFullscreen) {
      return;
    }

    fullscreenProgress.value = 0;
    fullscreenProgress.value = withTiming(1, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [fullscreenProgress, isMapFullscreen]);

  const originalPoiIds = useMemo(() => derivePoiSequence(data?.path ?? []), [data?.path]);

  useEffect(() => {
    if (!data || hasInitialized) {
      return;
    }

    // Skip placeholder tour detail state (cached tour with empty path) while
    // the real tour detail request is still in flight.
    if (isFetching && originalPoiIds.length === 0) {
      return;
    }

    setDraftPoiIds(originalPoiIds);
    setLastPersistedPoiIds(originalPoiIds);
    setLiveTourMetrics(createLiveTourMetrics(data.tour));
    setHasInitialized(true);
  }, [data, hasInitialized, isFetching, originalPoiIds]);

  useEffect(() => {
    if (!data || isEditMode) {
      return;
    }

    setTourNameDraft(data.tour.name);
  }, [data, isEditMode]);

  const allMapItems = useMemo<TourMapItem[]>(() => {
    const itemsById = new Map<string, TourMapItem>();

    for (const poi of poiData) {
      if (!hasCoordinate(poi)) {
        continue;
      }

      const inferredStampNumber = inferStampNumberFromPoi(poi);
      itemsById.set(poi.ID.toLowerCase(), {
        ID: poi.ID,
        name: cleanText(poi.name) || poi.ID,
        typeLabel: inferredStampNumber ? 'Stempel' : cleanText(poi.poiType) || 'POI',
        markerLabel: inferredStampNumber || 'POI',
        stampNumber: inferredStampNumber || undefined,
        kind: 'poi',
        latitude: poi.latitude,
        longitude: poi.longitude,
        description: cleanText(poi.description),
        imageUrl: cleanText(poi.heroImageUrl),
      });
    }

    for (const stamp of mapData?.stamps ?? []) {
      if (!hasCoordinate(stamp)) {
        continue;
      }

      const markerLabel = cleanText(stamp.number) || '--';
      itemsById.set(stamp.ID.toLowerCase(), {
        ID: stamp.ID,
        name: cleanText(stamp.name) || stamp.ID,
        typeLabel: stamp.kind === 'visited-stamp' ? 'Besucht' : 'Unbesucht',
        markerLabel,
        stampNumber: extractStampToken(markerLabel) || undefined,
        kind: stamp.kind,
        latitude: stamp.latitude,
        longitude: stamp.longitude,
        description: cleanText(stamp.description),
        imageUrl: cleanText(stamp.heroImageUrl || stamp.image),
      });
    }

    for (const parkingSpot of mapData?.parkingSpots ?? []) {
      if (!hasCoordinate(parkingSpot)) {
        continue;
      }

      itemsById.set(parkingSpot.ID.toLowerCase(), {
        ID: parkingSpot.ID,
        name: cleanText(parkingSpot.name) || 'Parkplatz',
        typeLabel: 'Parkplatz',
        markerLabel: 'P',
        kind: 'parking',
        latitude: parkingSpot.latitude,
        longitude: parkingSpot.longitude,
        description: cleanText(parkingSpot.description),
        imageUrl: cleanText(parkingSpot.image),
      });
    }

    return Array.from(itemsById.values());
  }, [mapData?.parkingSpots, mapData?.stamps, poiData]);

  const mapItemById = useMemo(() => {
    const nextMap = new Map<string, TourMapItem>();
    for (const item of allMapItems) {
      nextMap.set(item.ID.toLowerCase(), item);
    }

    return nextMap;
  }, [allMapItems]);

  const draftPoiStats = useMemo(() => {
    const positionsById = new Map<string, number[]>();
    draftPoiIds.forEach((poiId, index) => {
      const normalizedId = poiId.toLowerCase();
      const positions = positionsById.get(normalizedId) ?? [];
      positions.push(index + 1);
      positionsById.set(normalizedId, positions);
    });

    return { positionsById };
  }, [draftPoiIds]);

  const selectedMapItem = useMemo(() => {
    if (!selectedMapItemId) {
      return null;
    }

    return mapItemById.get(selectedMapItemId.toLowerCase()) ?? null;
  }, [mapItemById, selectedMapItemId]);

  const mapItemsForRendering = useMemo(() => {
    const pinnedById = new Map<string, TourMapItem>();

    for (const draftPoiId of draftPoiIds) {
      const item = mapItemById.get(draftPoiId.toLowerCase());
      if (item) {
        pinnedById.set(item.ID.toLowerCase(), item);
      }
    }

    if (selectedMapItem) {
      pinnedById.set(selectedMapItem.ID.toLowerCase(), selectedMapItem);
    }

    const visible = Array.from(pinnedById.values());
    const parkingItems = allMapItems.filter((item) => item.kind === 'parking');
    const stampItems = allMapItems.filter(
      (item) => item.kind === 'visited-stamp' || item.kind === 'open-stamp'
    );
    const poiItems = allMapItems.filter((item) => item.kind === 'poi');

    // Essential markers: parking and stamps are always shown.
    for (const parkingItem of parkingItems) {
      if (pinnedById.has(parkingItem.ID.toLowerCase())) {
        continue;
      }
      visible.push(parkingItem);
    }

    for (const stampItem of stampItems) {
      if (pinnedById.has(stampItem.ID.toLowerCase())) {
        continue;
      }
      visible.push(stampItem);
    }

    // Generic POIs are always shown as regular markers (no clustering/limiting).
    for (const poiItem of poiItems) {
      if (pinnedById.has(poiItem.ID.toLowerCase())) {
        continue;
      }

      visible.push(poiItem);
    }

    return visible;
  }, [allMapItems, draftPoiIds, mapItemById, selectedMapItem]);

  const routeCoordinates = useMemo(
    () =>
      draftPoiIds
        .map((poiId) => mapItemById.get(poiId.toLowerCase()))
        .filter((item): item is TourMapItem => Boolean(item))
        .map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
    [draftPoiIds, mapItemById]
  );

  const hasPendingChanges = useMemo(
    () => !arraysEqual(draftPoiIds, lastPersistedPoiIds),
    [draftPoiIds, lastPersistedPoiIds]
  );

  useEffect(() => {
    if (!hasInitialized || !data) {
      return;
    }

    if (saveStatus === 'saving' || saveStatus === 'pending' || hasPendingChanges) {
      return;
    }

    setLiveTourMetrics(createLiveTourMetrics(data.tour));
    if (!arraysEqual(lastPersistedPoiIds, originalPoiIds)) {
      setLastPersistedPoiIds(originalPoiIds);
    }
  }, [data, hasInitialized, hasPendingChanges, lastPersistedPoiIds, originalPoiIds, saveStatus]);

  const normalizedTourOwnerId = normalizeUserId(data?.tour.createdBy);
  const ownershipResolved = Boolean(normalizedCurrentUserId && normalizedTourOwnerId);
  const canEnterEditMode = ownershipResolved && normalizedTourOwnerId === normalizedCurrentUserId;
  const editingBlocked = !isEditMode || blockingErrorCode === 403 || blockingErrorCode === 404;
  const selectedItemInTourCount = selectedMapItem
    ? (draftPoiStats.positionsById.get(selectedMapItem.ID.toLowerCase()) ?? []).length
    : 0;
  const selectedRouteOrderLabel = useMemo(() => {
    if (!selectedMapItem) {
      return null;
    }

    const positions = draftPoiStats.positionsById.get(selectedMapItem.ID.toLowerCase()) ?? [];
    if (positions.length === 0) {
      return null;
    }

    return resolveRouteOrderLabel(positions);
  }, [draftPoiStats.positionsById, selectedMapItem]);
  const selectedStampNumber = getStampNumber(selectedMapItem);
  const selectedMapItemImageSource = useMemo<ImageSourcePropType | null>(
    () => resolveMapItemImageSource(selectedMapItem?.imageUrl, accessToken),
    [accessToken, selectedMapItem?.imageUrl]
  );
  const resetDraftToPersistedState = useCallback(() => {
    cancelPendingPreview();
    setDraftPoiIds(lastPersistedPoiIds);
    setLastSaveErrorCode(null);
    setSaveStatus('idle');
    setStatusMessage(null);

    if (data?.tour) {
      setLiveTourMetrics(createLiveTourMetrics(data.tour));
    }
  }, [cancelPendingPreview, data?.tour, lastPersistedPoiIds]);
  const handleEnterEditMode = useCallback(() => {
    if (!canEnterEditMode || isEditMode) {
      return;
    }

    setDraftPoiIds(lastPersistedPoiIds);
    setTourNameDraft(data?.tour.name ?? '');
    setLastSaveErrorCode(null);
    setSaveStatus('idle');
    setStatusMessage(null);
    setIsEditMode(true);
  }, [canEnterEditMode, data?.tour.name, isEditMode, lastPersistedPoiIds]);
  useEffect(() => {
    if (hasAppliedAutoStartEditModeRef.current) {
      return;
    }

    if (!shouldStartInEditMode) {
      hasAppliedAutoStartEditModeRef.current = true;
      return;
    }

    if (!hasInitialized) {
      return;
    }

    if (!canEnterEditMode) {
      if (ownershipResolved) {
        hasAppliedAutoStartEditModeRef.current = true;
      }
      return;
    }

    handleEnterEditMode();
    hasAppliedAutoStartEditModeRef.current = true;
  }, [canEnterEditMode, handleEnterEditMode, hasInitialized, ownershipResolved, shouldStartInEditMode]);
  const exitEditMode = useCallback(() => {
    setTourNameDraft(data?.tour.name ?? '');
    setIsEditMode(false);
  }, [data?.tour.name]);
  function handleExitEditMode() {
    if (!isEditMode || updateTourMutation.isPending || updateTourNameMutation.isPending) {
      return;
    }

    if (!hasPendingChanges) {
      exitEditMode();
      return;
    }

    Alert.alert(
      'Aenderungen speichern?',
      'Moechtest du die Aenderungen speichern, bevor du den Bearbeitungsmodus verlaesst?',
      [
        {
          text: 'Weiter bearbeiten',
          style: 'cancel',
        },
        {
          text: 'Ohne Speichern',
          style: 'destructive',
          onPress: () => {
            resetDraftToPersistedState();
            exitEditMode();
          },
        },
        {
          text: 'Speichern',
          onPress: () => {
            void (async () => {
              const didSave = await performSave(draftPoiIds, { manual: true });
              if (didSave) {
                exitEditMode();
              }
            })();
          },
        },
      ]
    );
  }
  const handleCancelPendingChangesAndExit = useCallback(() => {
    if (!isEditMode || updateTourMutation.isPending || updateTourNameMutation.isPending) {
      return;
    }

    resetDraftToPersistedState();
    exitEditMode();
  }, [
    exitEditMode,
    isEditMode,
    resetDraftToPersistedState,
    updateTourMutation.isPending,
    updateTourNameMutation.isPending,
  ]);
  const handleShareTour = useCallback(async () => {
    if (!data?.tour?.ID) {
      return;
    }

    const deepLink = ExpoLinking.createURL(`/tours/${encodeURIComponent(data.tour.ID)}`);
    const tourName = data.tour.name?.trim() || 'Tour';

    try {
      await Share.share({
        message: `${tourName}\n${deepLink}`,
        title: tourName,
        url: deepLink,
      });
    } catch (nextError) {
      Alert.alert('Teilen nicht moeglich', nextError instanceof Error ? nextError.message : 'Unknown error');
    }
  }, [data?.tour?.ID, data?.tour?.name]);
  useEffect(() => {
    if (!isEditMode || canEnterEditMode) {
      return;
    }

    resetDraftToPersistedState();
    setIsEditMode(false);
  }, [canEnterEditMode, isEditMode, resetDraftToPersistedState]);
  const skipNextPreventRemoveRef = useRef(false);

  usePreventRemove(isEditMode && hasPendingChanges && !updateTourMutation.isPending, (event) => {
    if (skipNextPreventRemoveRef.current) {
      skipNextPreventRemoveRef.current = false;
      return;
    }

    Alert.alert(
      'Ungespeicherte Aenderungen',
      'Du hast ungespeicherte Aenderungen an der Tour. Ohne Speichern verwerfen?',
      [
        {
          text: 'Weiter bearbeiten',
          style: 'cancel',
        },
        {
          text: 'Verwerfen',
          style: 'destructive',
          onPress: () => {
            skipNextPreventRemoveRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ]
    );
  });

  const searchResults = useMemo<SearchCandidate[]>(() => {
    if (!isSearchFocused || allMapItems.length === 0) {
      return [];
    }

    const normalizedQuery = normalizeSearchValue(poiSearchQuery);
    if (!normalizedQuery) {
      return [];
    }

    return allMapItems
      .map((item, originalIndex) => {
        const rank = rankSearchItem(item, normalizedQuery);
        if (!rank) {
          return null;
        }

        return {
          item,
          originalIndex,
          rank,
          distanceKm: haversineDistanceKm(mapCenter, {
            latitude: item.latitude,
            longitude: item.longitude,
          }),
        };
      })
      .filter(
        (
          entry
        ): entry is { item: TourMapItem; originalIndex: number; rank: SearchResultRank; distanceKm: number } =>
          entry !== null
      )
      .sort((left, right) => {
        if (left.rank.matchTier !== right.rank.matchTier) {
          return left.rank.matchTier - right.rank.matchTier;
        }

        if (left.rank.matchIndex !== right.rank.matchIndex) {
          return left.rank.matchIndex - right.rank.matchIndex;
        }

        if (left.rank.numberDelta !== right.rank.numberDelta) {
          return left.rank.numberDelta - right.rank.numberDelta;
        }

        if (left.rank.nameLength !== right.rank.nameLength) {
          return left.rank.nameLength - right.rank.nameLength;
        }

        if (left.distanceKm !== right.distanceKm) {
          return left.distanceKm - right.distanceKm;
        }

        if (left.originalIndex !== right.originalIndex) {
          return left.originalIndex - right.originalIndex;
        }

        return left.item.name.localeCompare(right.item.name, 'de');
      })
      .slice(0, SEARCH_RESULT_LIMIT)
      .map((entry) => ({
        ...entry.item,
        distanceKm: entry.distanceKm,
      }));
  }, [allMapItems, isSearchFocused, mapCenter, poiSearchQuery]);

  useEffect(() => {
    if (!isMapReady) {
      return;
    }

    const coordinatesToFit =
      routeCoordinates.length > 0
        ? routeCoordinates
        : allMapItems
            .slice(0, 16)
            .map((item) => ({ latitude: item.latitude, longitude: item.longitude }));

    if (coordinatesToFit.length === 0 || !mapRef.current) {
      return;
    }

    if (coordinatesToFit.length === 1) {
      const coordinate = coordinatesToFit[0];
      const nextRegion: Region = {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
      regionRef.current = nextRegion;
      setMapCenter({ latitude: nextRegion.latitude, longitude: nextRegion.longitude });
      mapRef.current.animateToRegion(nextRegion, 240);
      return;
    }

    mapRef.current.fitToCoordinates(coordinatesToFit, {
      edgePadding: MAP_EDGE_PADDING,
      animated: true,
    });
  }, [allMapItems, isMapReady, routeCoordinates]);

  const handleZoomBy = useCallback((factor: number) => {
    if (!mapRef.current) {
      return;
    }

    const nextRegion: Region = {
      ...regionRef.current,
      latitudeDelta: clampDelta(regionRef.current.latitudeDelta * factor),
      longitudeDelta: clampDelta(regionRef.current.longitudeDelta * factor),
    };

    regionRef.current = nextRegion;
    setMapCenter({ latitude: nextRegion.latitude, longitude: nextRegion.longitude });
    mapRef.current.animateToRegion(nextRegion, 180);
  }, []);

  const focusMapItemOnMap = useCallback((item: TourMapItem, options?: { updateSearchQuery?: boolean }) => {
    lastMarkerPressAtRef.current = Date.now();

    const nextRegion: Region = {
      latitude: item.latitude,
      longitude: item.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };

    setSelectedMapItemId(item.ID);
    if (options?.updateSearchQuery) {
      setPoiSearchQuery(item.name);
    }
    setIsSearchFocused(false);
    regionRef.current = nextRegion;
    setMapCenter({ latitude: nextRegion.latitude, longitude: nextRegion.longitude });
    mapRef.current?.animateToRegion(nextRegion, 220);
  }, []);

  const performSave = useCallback(
    async function saveDraft(poiIds: string[], options?: { manual?: boolean }) {
      if (editingBlocked) {
        return false;
      }

      if (poiIds.length < 2) {
        if (options?.manual) {
          Alert.alert(
            'Zu wenige Punkte',
            'Mindestens zwei Punkte benoetigt (Start und Ziel), bevor gespeichert werden kann.'
          );
        }
        return false;
      }

      cancelPendingPreview();

      setSaveStatus('saving');
      setStatusMessage('Wird gespeichert...');
      setLastSaveErrorCode(null);

      try {
        const response = await updateTourMutation.mutateAsync({ poiIds });
        setLiveTourMetrics((current) =>
          updateMetricsFromResponse(
            current || createEmptyLiveTourMetrics(),
            response
          )
        );
        setLastPersistedPoiIds(poiIds);
        setSaveStatus('saved');
        setStatusMessage('Alle Aenderungen gespeichert');
        setLastSaveErrorCode(null);
        const refreshed = await refetch();
        if (refreshed.data?.tour) {
          setLiveTourMetrics(createLiveTourMetrics(refreshed.data.tour));
          const refreshedPoiIds = derivePoiSequence(refreshed.data.path ?? []);
          setDraftPoiIds(refreshedPoiIds);
          setLastPersistedPoiIds(refreshedPoiIds);
        }
        return true;
      } catch (nextError) {
        setSaveStatus('error');

        if (nextError instanceof HttpStatusError) {
          if (nextError.status === 403) {
            setBlockingErrorCode(403);
            setLastSaveErrorCode(403);
            setStatusMessage('Bearbeitung gesperrt');
            return false;
          }

          if (nextError.status === 404) {
            setBlockingErrorCode(404);
            setLastSaveErrorCode(404);
            setStatusMessage('Tour nicht mehr vorhanden');
            return false;
          }

          if (nextError.status === 422) {
            setLastSaveErrorCode(422);
            setStatusMessage('Route unvollstaendig berechenbar');
            return false;
          }
        }

        setStatusMessage('Speichern fehlgeschlagen');
        return false;
      }
    },
    [cancelPendingPreview, editingBlocked, refetch, updateTourMutation]
  );
  useEffect(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    if (!isEditMode) {
      previewRequestIdRef.current += 1;
      return;
    }

    if (!hasInitialized || editingBlocked || updateTourMutation.isPending) {
      return;
    }

    if (!hasPendingChanges) {
      return;
    }

    setSaveStatus((current) => (current === 'saving' ? current : 'pending'));
    setStatusMessage('Aenderungen ausstehend...');

    if (draftPoiIds.length < 2) {
      setLastSaveErrorCode(null);
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      void (async () => {
        try {
          const response = await previewTour({ poiIds: draftPoiIds });
          if (previewRequestIdRef.current !== requestId) {
            return;
          }

          setLiveTourMetrics((current) =>
            updateMetricsFromResponse(
              current || createEmptyLiveTourMetrics(),
              response
            )
          );
          setLastSaveErrorCode(null);
          setStatusMessage('Vorschau aktualisiert (nicht gespeichert)');
        } catch (nextError) {
          if (previewRequestIdRef.current !== requestId) {
            return;
          }

          if (nextError instanceof HttpStatusError) {
            if (nextError.status === 403) {
              setBlockingErrorCode(403);
              setLastSaveErrorCode(403);
              setSaveStatus('error');
              setStatusMessage('Bearbeitung gesperrt');
              return;
            }

            if (nextError.status === 404) {
              setBlockingErrorCode(404);
              setLastSaveErrorCode(404);
              setSaveStatus('error');
              setStatusMessage('Tour nicht mehr vorhanden');
              return;
            }

            if (nextError.status === 422) {
              setLastSaveErrorCode(422);
              setStatusMessage('Route unvollstaendig berechenbar');
              return;
            }
          }

          setStatusMessage('Vorschau konnte nicht aktualisiert werden');
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);
  }, [
    draftPoiIds,
    isEditMode,
    editingBlocked,
    hasInitialized,
    hasPendingChanges,
    previewTour,
    updateTourMutation.isPending,
  ]);

  const handleAppendSelectedPoi = useCallback(() => {
    if (editingBlocked || !selectedMapItem) {
      return;
    }

    setDraftPoiIds((current) => [...current, selectedMapItem.ID]);
  }, [editingBlocked, selectedMapItem]);

  const openMapItemDetailPage = useCallback(
    (item: TourMapItem) => {
      if (item.kind === 'parking') {
        router.push({
          pathname: '/parking/[id]',
          params: {
            id: item.ID,
            disableNavigation: '1',
            source: 'tour',
          },
        } as never);
        return;
      }

      const stampNumber = getStampNumber(item);
      if (
        item.kind === 'visited-stamp' ||
        item.kind === 'open-stamp' ||
        stampNumber
      ) {
        router.push({
          pathname: '/stamps/[id]',
          params: {
            id: item.ID,
            disableNavigation: '1',
            source: 'tour',
          },
        } as never);
        return;
      }

      Alert.alert(
        'Keine Detailseite verfuegbar',
        'Fuer diesen Punkt ist aktuell keine separate Detailseite vorhanden.'
      );
    },
    [router]
  );

  const openSelectedItemDetailPage = useCallback(() => {
    if (!selectedMapItem) {
      return;
    }

    openMapItemDetailPage(selectedMapItem);
  }, [openMapItemDetailPage, selectedMapItem]);

  const openListItemDetailPage = useCallback(
    (item?: TourMapItem) => {
      if (!item) {
        return;
      }

      openMapItemDetailPage(item);
    },
    [openMapItemDetailPage]
  );

  const movePoi = useCallback(
    (index: number, direction: -1 | 1) => {
      if (editingBlocked) {
        return;
      }

      setDraftPoiIds((current) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= current.length) {
          return current;
        }

        const next = [...current];
        const temp = next[targetIndex];
        next[targetIndex] = next[index];
        next[index] = temp;
        return next;
      });
    },
    [editingBlocked]
  );

  const removePoiAtIndex = useCallback(
    (index: number) => {
      if (editingBlocked) {
        return;
      }

      setDraftPoiIds((current) => current.filter((_, currentIndex) => currentIndex !== index));
    },
    [editingBlocked]
  );

  const handleDeleteTour = useCallback(() => {
    if (editingBlocked || deleteTourMutation.isPending) {
      return;
    }

    Alert.alert('Tour loeschen?', 'Diese Aktion kann nicht rueckgaengig gemacht werden.', [
      {
        text: 'Abbrechen',
        style: 'cancel',
      },
      {
        text: 'Loeschen',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteTourMutation.mutateAsync();
              router.replace('/(tabs)/tours' as never);
            } catch (nextError) {
              if (nextError instanceof HttpStatusError && nextError.status === 404) {
                router.replace('/(tabs)/tours' as never);
                return;
              }

              Alert.alert(
                'Tour konnte nicht geloescht werden',
                nextError instanceof Error ? nextError.message : 'Unbekannter Fehler'
              );
            }
          })();
        },
      },
    ]);
  }, [deleteTourMutation, editingBlocked, router]);

  const handleSubmitRename = useCallback(async (options?: { silent?: boolean }) => {
    if (editingBlocked || updateTourNameMutation.isPending || !data) {
      return;
    }

    const normalizedName = tourNameDraft.trim();
    if (!normalizedName) {
      if (options?.silent) {
        setTourNameDraft(data.tour.name);
        return;
      }
      Alert.alert('Name fehlt', 'Bitte gib einen Namen fuer die Tour ein.');
      return;
    }

    if (normalizedName === data.tour.name) {
      if (tourNameDraft !== normalizedName) {
        setTourNameDraft(normalizedName);
      }
      return;
    }

    try {
      setTourNameDraft(normalizedName);
      await updateTourNameMutation.mutateAsync({ name: normalizedName });
      setStatusMessage('Tourname aktualisiert');
      setSaveStatus((current) => (current === 'saving' ? current : 'saved'));
      await refetch();
    } catch (nextError) {
      Alert.alert(
        'Name konnte nicht gespeichert werden',
        nextError instanceof Error ? nextError.message : 'Unbekannter Fehler'
      );
    }
  }, [data, editingBlocked, refetch, tourNameDraft, updateTourNameMutation]);

  if (!tourId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Tour-ID fehlt</Text>
        </View>
      </SafeAreaView>
    );
  }

  if ((isPending && !data) || isPoiPending || isMapDataPending || !liveTourMetrics) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6b4b" size="large" />
          <Text style={styles.helperText}>Lade Tourdetails...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data || error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Tour konnte nicht geladen werden</Text>
          <Text style={styles.errorBody}>{error?.message || 'Keine Daten verfuegbar.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const saveStateLabel = (() => {
    if (!isEditMode) {
      return 'Nur Ansicht';
    }
    if (blockingErrorCode === 403) {
      return 'Bearbeitung gesperrt';
    }
    if (blockingErrorCode === 404) {
      return 'Tour nicht mehr vorhanden';
    }
    if (saveStatus === 'saving') {
      return 'Wird gespeichert...';
    }
    if (saveStatus === 'pending' || hasPendingChanges) {
      return 'Aenderungen ausstehend...';
    }
    if (saveStatus === 'saved') {
      return 'Alle Aenderungen gespeichert';
    }
    if (saveStatus === 'error' && lastSaveErrorCode === 422) {
      return 'Route unvollstaendig berechenbar';
    }
    return statusMessage || 'Bereit';
  })();
  const isSaveDisabled = editingBlocked || updateTourMutation.isPending || draftPoiIds.length < 2;
  const saveButtonLabel = updateTourMutation.isPending ? 'Speichere...' : 'Jetzt speichern';

  const renderTourMap = (isFullscreen: boolean) => (
    <View style={[styles.mapCard, isFullscreen && styles.mapCardFullscreen]}>
      <MapView
        ref={mapRef}
        initialRegion={HARZ_REGION}
        onMapReady={() => setIsMapReady(true)}
        onPress={() => {
          if (Date.now() - lastMarkerPressAtRef.current < 250) {
            return;
          }

          setSelectedMapItemId(null);
          setIsSearchFocused(false);
        }}
        onRegionChangeComplete={(nextRegion) => {
          regionRef.current = nextRegion;
          setMapCenter({
            latitude: nextRegion.latitude,
            longitude: nextRegion.longitude,
          });
        }}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}>
        {routeCoordinates.length > 1 ? (
          <Polyline coordinates={routeCoordinates} strokeColor="#2e6b4b" strokeWidth={4} />
        ) : null}

        {mapItemsForRendering.map((item) => {
          const normalizedItemId = item.ID.toLowerCase();
          const routePositions = draftPoiStats.positionsById.get(normalizedItemId) ?? [];
          const isInTour = routePositions.length > 0;
          const routeOrderLabel = resolveRouteOrderLabel(routePositions);
          const routeOrderImageLabel = resolveRouteOrderImageLabel(routeOrderLabel);
          const inTourMarkerKind =
            item.kind === 'visited-stamp' || item.kind === 'open-stamp'
              ? item.kind
              : item.kind === 'parking'
                ? 'parking-order'
              : 'tour-order';
          const isSelected = selectedMapItemId === item.ID;
          const markerRenderKey = `${item.ID}:${isInTour ? `tour:${routeOrderLabel}` : 'base'}:${isSelected ? 'selected' : 'default'}`;

          const tourOrderMarkerImage =
            getPreGeneratedMapMarkerImageSource({
              kind: inTourMarkerKind,
              label: routeOrderImageLabel,
            }) ||
            getPreGeneratedMapMarkerImageSource({
              kind: inTourMarkerKind,
              label: '--',
            });

          const markerImage =
            isInTour
              ? tourOrderMarkerImage
              : item.kind === 'visited-stamp' || item.kind === 'open-stamp' || item.kind === 'parking'
                ? getPreGeneratedMapMarkerImageSource({
                    kind: item.kind,
                    label: item.kind === 'parking' ? 'P' : extractStampToken(item.markerLabel) || item.markerLabel,
                  })
                : null;

          if (markerImage) {
            return (
              <Marker
                anchor={{ x: 0.5, y: 1 }}
                coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                image={markerImage}
                key={markerRenderKey}
                onPress={() => focusMapItemOnMap(item)}
                pinColor={undefined}
                tracksViewChanges={false}
                zIndex={isSelected ? 20 : isInTour ? 10 : 0}
              />
            );
          }

          if (isInTour || item.kind === 'visited-stamp' || item.kind === 'open-stamp' || item.kind === 'parking') {
            const fallbackLabel =
              isInTour
                ? routeOrderLabel
                : item.kind === 'parking'
                  ? 'P'
                  : extractStampToken(item.markerLabel) || '--';
            const useTourFallbackColor =
              isInTour && inTourMarkerKind !== 'open-stamp' && inTourMarkerKind !== 'parking-order';
            const useParkingFallbackColor =
              inTourMarkerKind === 'parking-order' || (!isInTour && item.kind === 'parking');

            return (
              <Marker
                anchor={{ x: 0.5, y: 0.5 }}
                coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                key={markerRenderKey}
                onPress={() => focusMapItemOnMap(item)}
                zIndex={isSelected ? 20 : isInTour ? 10 : 0}>
                <View
                  collapsable={false}
                  style={[
                    styles.markerFallback,
                    useTourFallbackColor && styles.markerFallbackInTour,
                    useParkingFallbackColor && styles.markerFallbackParking,
                    isSelected && styles.markerFallbackSelected,
                  ]}>
                  <Text
                    style={[
                      styles.markerFallbackLabel,
                      useTourFallbackColor && styles.markerFallbackLabelInTour,
                    ]}>
                    {fallbackLabel}
                  </Text>
                </View>
              </Marker>
            );
          }

          return (
            <Marker
              coordinate={{ latitude: item.latitude, longitude: item.longitude }}
              key={markerRenderKey}
              onPress={() => focusMapItemOnMap(item)}
              pinColor={isSelected ? '#2e6b4b' : '#bf7f3f'}
              tracksViewChanges={false}
              zIndex={isSelected ? 20 : 0}
            />
          );
        })}
      </MapView>

      <View style={[styles.mapTopBar, isFullscreen && { top: insets.top + 10 }]}>
        <View style={styles.mapTopControlsRow}>
          <View style={styles.mapSearchWrap}>
            <Feather color="#6d7d6e" name="search" size={14} />
            <TextInput
              onBlur={() => setIsSearchFocused(false)}
              onChangeText={setPoiSearchQuery}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Punkte auf der Karte suchen"
              placeholderTextColor="#7b8776"
              style={styles.mapSearchInput}
              value={poiSearchQuery}
            />
          </View>

          <Pressable
            onPress={isFullscreen ? closeMapFullscreen : openMapFullscreen}
            style={({ pressed }) => [styles.mapFullscreenButton, pressed && styles.pressed]}>
            <Feather color="#2e3a2e" name={isFullscreen ? 'minimize-2' : 'maximize-2'} size={16} />
          </Pressable>
        </View>

        {isSearchFocused && searchResults.length > 0 ? (
          <View style={styles.searchResultsPopover}>
            {searchResults.map((item) => {
              const stampNumber = getStampNumber(item);
              return (
                <Pressable
                  key={item.ID}
                  onPress={() => focusMapItemOnMap(item, { updateSearchQuery: true })}
                  style={({ pressed }) => [styles.searchResultRow, pressed && styles.pressed]}>
                  <Text numberOfLines={1} style={styles.searchResultTitle}>
                    {stampNumber ? `#${stampNumber} · ${item.name}` : item.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.searchResultMeta}>
                    {`${stampNumber ? `Stempel ${stampNumber} • ` : ''}${item.typeLabel} • ${formatDistanceKm(item.distanceKm)}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={[styles.mapZoomControls, isFullscreen && { top: insets.top + 72 }]}>
        <Pressable onPress={() => handleZoomBy(0.65)} style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
          <Text style={styles.zoomButtonLabel}>+</Text>
        </Pressable>
        <Pressable onPress={() => handleZoomBy(1.55)} style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
          <Text style={styles.zoomButtonLabel}>−</Text>
        </Pressable>
      </View>

      {selectedMapItem ? (
        <View style={[styles.mapBottomSheet, isFullscreen && { bottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={openSelectedItemDetailPage}
            style={({ pressed }) => [styles.mapBottomInfoTap, pressed && styles.pressed]}>
            <View style={styles.mapBottomInfoRow}>
              {selectedMapItemImageSource ? (
                <Image source={selectedMapItemImageSource} style={styles.mapBottomArtwork} />
              ) : (
                <LinearGradient
                  colors={getMapItemGradientColors(selectedMapItem.kind)}
                  style={styles.mapBottomArtwork}
                />
              )}
              <View style={styles.mapBottomInfoCopy}>
                <Text numberOfLines={1} style={styles.mapBottomTitle}>
                  {`${selectedStampNumber ? `#${selectedStampNumber} · ` : ''}${selectedMapItem.name}`}
                </Text>
                <Text numberOfLines={1} style={styles.mapBottomMeta}>
                  {`${selectedRouteOrderLabel ? `Besuch ${selectedRouteOrderLabel} • ` : ''}${selectedStampNumber ? `Stempel ${selectedStampNumber} • ` : ''}${selectedMapItem.typeLabel}`}
                </Text>
              </View>
              <View style={styles.mapBottomOpenHint}>
                <Text style={styles.mapBottomOpenLabel}>Oeffnen</Text>
                <Feather color="#4d5b4d" name="chevron-right" size={16} />
              </View>
            </View>
          </Pressable>
          {isEditMode ? (
            <Pressable
              disabled={editingBlocked}
              onPress={handleAppendSelectedPoi}
              style={({ pressed }) => [
                styles.addButton,
                editingBlocked && styles.addButtonDisabled,
                pressed && !editingBlocked && styles.pressed,
              ]}>
              <Text style={styles.addButtonLabel}>
                {selectedItemInTourCount > 0 ? 'Nochmals hinzufuegen' : 'Zur Tour hinzufuegen'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
          <View style={styles.headerTopRow}>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                  return;
                }

                router.replace('/(tabs)/tours' as never);
              }}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Feather color="#1e2a1e" name="arrow-left" size={16} />
            </Pressable>

            <View style={styles.headerActions}>
              {!isEditMode ? (
                <Pressable
                  onPress={() => void handleShareTour()}
                  style={({ pressed }) => [styles.shareHeaderButton, pressed && styles.pressed]}>
                  <Feather color="#3a4f84" name="share-2" size={14} />
                  <Text style={styles.shareHeaderButtonLabel}>Teilen</Text>
                </Pressable>
              ) : null}
              {isEditMode ? (
                <Pressable
                  disabled={isSaveDisabled}
                  onPress={() => void performSave(draftPoiIds, { manual: true })}
                  style={({ pressed }) => [
                    styles.saveHeaderButton,
                    isSaveDisabled && styles.saveHeaderButtonDisabled,
                    pressed && !isSaveDisabled && styles.pressed,
                  ]}>
                  <Feather color="#f5f3ee" name="save" size={14} />
                  <Text style={styles.saveHeaderButtonLabel}>{saveButtonLabel}</Text>
                </Pressable>
              ) : null}

              {canEnterEditMode ? (
                isEditMode && hasPendingChanges ? (
                  <>
                    <Pressable
                      disabled={
                        updateTourMutation.isPending ||
                        updateTourNameMutation.isPending
                      }
                      onPress={handleExitEditMode}
                      style={({ pressed }) => [
                        styles.modeHeaderButton,
                        (updateTourMutation.isPending || updateTourNameMutation.isPending) &&
                          styles.modeHeaderButtonDisabled,
                        pressed &&
                          !updateTourMutation.isPending &&
                          !updateTourNameMutation.isPending &&
                          styles.pressed,
                      ]}>
                      <Feather
                        color={
                          updateTourMutation.isPending || updateTourNameMutation.isPending
                            ? '#9ba59a'
                            : '#2e6b4b'
                        }
                        name="check"
                        size={14}
                      />
                      <Text
                        style={[
                          styles.modeHeaderButtonLabel,
                          (updateTourMutation.isPending || updateTourNameMutation.isPending) &&
                            styles.modeHeaderButtonLabelDisabled,
                        ]}>
                        Fertig
                      </Text>
                    </Pressable>

                    <Pressable
                      disabled={updateTourMutation.isPending || updateTourNameMutation.isPending}
                      onPress={handleCancelPendingChangesAndExit}
                      style={({ pressed }) => [
                        styles.cancelHeaderButton,
                        (updateTourMutation.isPending || updateTourNameMutation.isPending) &&
                          styles.cancelHeaderButtonDisabled,
                        pressed &&
                          !updateTourMutation.isPending &&
                          !updateTourNameMutation.isPending &&
                          styles.pressed,
                      ]}>
                      <Feather
                        color={
                          updateTourMutation.isPending || updateTourNameMutation.isPending
                            ? '#b8a8a8'
                            : '#8a5a3a'
                        }
                        name="x"
                        size={14}
                      />
                      <Text
                        style={[
                          styles.cancelHeaderButtonLabel,
                          (updateTourMutation.isPending || updateTourNameMutation.isPending) &&
                            styles.cancelHeaderButtonLabelDisabled,
                        ]}>
                        Abbrechen
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    disabled={updateTourMutation.isPending || updateTourNameMutation.isPending}
                    onPress={isEditMode ? handleExitEditMode : handleEnterEditMode}
                    style={({ pressed }) => [
                      styles.modeHeaderButton,
                      (updateTourMutation.isPending || updateTourNameMutation.isPending) &&
                        styles.modeHeaderButtonDisabled,
                      pressed &&
                        !(updateTourMutation.isPending || updateTourNameMutation.isPending) &&
                        styles.pressed,
                    ]}>
                    <Feather
                      color={
                        updateTourMutation.isPending || updateTourNameMutation.isPending
                          ? '#9ba59a'
                          : '#2e6b4b'
                      }
                      name={isEditMode ? 'check' : 'edit-2'}
                      size={14}
                    />
                    <Text
                      style={[
                        styles.modeHeaderButtonLabel,
                        (updateTourMutation.isPending || updateTourNameMutation.isPending) &&
                          styles.modeHeaderButtonLabelDisabled,
                      ]}>
                      {isEditMode ? 'Fertig' : 'Bearbeiten'}
                    </Text>
                  </Pressable>
                )
              ) : null}

              {isEditMode ? (
                <Pressable
                  disabled={editingBlocked || deleteTourMutation.isPending}
                  onPress={handleDeleteTour}
                  style={({ pressed }) => [
                    styles.deleteHeaderButton,
                    (editingBlocked || deleteTourMutation.isPending) && styles.deleteHeaderButtonDisabled,
                    pressed && !editingBlocked && !deleteTourMutation.isPending && styles.pressed,
                  ]}>
                  <Feather
                    color={editingBlocked || deleteTourMutation.isPending ? '#b8a8a8' : '#a34e4e'}
                    name="trash-2"
                    size={14}
                  />
                  <Text
                    style={[
                      styles.deleteHeaderButtonLabel,
                      (editingBlocked || deleteTourMutation.isPending) && styles.deleteHeaderButtonLabelDisabled,
                    ]}>
                    {deleteTourMutation.isPending ? 'Loesche...' : 'Loeschen'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {isEditMode ? (
            <View style={styles.titleInputShell}>
              <TextInput
                editable={!editingBlocked && !updateTourNameMutation.isPending}
                maxLength={120}
                onBlur={() => void handleSubmitRename({ silent: true })}
                onChangeText={setTourNameDraft}
                onSubmitEditing={() => void handleSubmitRename()}
                placeholder="Tourname"
                placeholderTextColor="#7b8776"
                returnKeyType="done"
                style={[
                  styles.titleInput,
                  (editingBlocked || updateTourNameMutation.isPending) && styles.titleInputDisabled,
                ]}
                value={tourNameDraft}
              />
            </View>
          ) : (
            <Text style={styles.title}>{data.tour.name}</Text>
          )}
          <Text style={styles.subtitle}>{`${formatDistance(liveTourMetrics.distance)} • ${formatDuration(liveTourMetrics.duration)} • ${liveTourMetrics.stampCount ?? 0} Stempel`}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Tourprofil</Text>
            <Text style={styles.profileStatusText}>{saveStateLabel}</Text>
          </View>
          <Text style={styles.cardLine}>{`Distanz: ${formatDistance(liveTourMetrics.distance)}`}</Text>
          <Text style={styles.cardLine}>{`Dauer: ${formatDuration(liveTourMetrics.duration)}`}</Text>
          <Text style={styles.cardLine}>{`Hoehenprofil: ↑${formatElevation(liveTourMetrics.totalElevationGain)} • ↓${formatElevation(liveTourMetrics.totalElevationLoss)}`}</Text>
          <Text style={styles.cardLine}>{`Stempel: ${liveTourMetrics.stampCount ?? 0}`}</Text>
        </View>

        {blockingErrorCode === 403 ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningTitle}>Bearbeitung gesperrt</Text>
            <Text style={styles.warningBody}>Diese Tour gehoert nicht zum aktuellen Benutzer.</Text>
          </View>
        ) : null}
        {blockingErrorCode === 404 ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningTitle}>Tour nicht mehr vorhanden</Text>
            <Text style={styles.warningBody}>Die Tour wurde entfernt oder ist nicht mehr verfuegbar.</Text>
          </View>
        ) : null}
        {lastSaveErrorCode === 422 ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningTitle}>Route unvollstaendig</Text>
            <Text style={styles.warningBody}>
              Die Route kann mit dieser Reihenfolge nicht vollstaendig berechnet werden. Bitte Reihenfolge
              oder Punkte anpassen.
            </Text>
          </View>
        ) : null}

        {isMapFullscreen ? null : renderTourMap(false)}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aktuelle Reihenfolge</Text>
          {draftPoiIds.length === 0 ? (
            <Text style={styles.cardLine}>Noch keine Punkte in der Tour.</Text>
          ) : (
            draftPoiIds.map((poiId, index) => {
              const item = mapItemById.get(poiId.toLowerCase());
              const title = item?.name || poiId;
              const stampNumber = getStampNumber(item);
              const pathItemImageSource = resolveMapItemImageSource(item?.imageUrl, accessToken);

              return (
                <View key={`${poiId}-${index}`} style={styles.pathRow}>
                  <Pressable
                    disabled={!item}
                    onPress={() => {
                      if (!item) {
                        return;
                      }

                      focusMapItemOnMap(item);
                    }}
                    style={({ pressed }) => [
                      styles.pathOpenable,
                      pressed && item && styles.pressed,
                    ]}>
                    {pathItemImageSource ? (
                      <Image source={pathItemImageSource} style={styles.pathArtwork} />
                    ) : item ? (
                      <LinearGradient
                        colors={getMapItemGradientColors(item.kind)}
                        style={styles.pathArtwork}
                      />
                    ) : (
                      <View style={[styles.pathArtwork, styles.pathArtworkFallback]}>
                        <Text style={styles.pathArtworkFallbackLabel}>?</Text>
                      </View>
                    )}

                    <View style={styles.pathCopy}>
                      <Text style={styles.pathTitle}>
                        {`${formatAlphabeticOrder(index + 1)}. ${stampNumber ? `#${stampNumber} · ` : ''}${title}`}
                      </Text>
                      <Text style={styles.pathMeta}>
                        {stampNumber
                          ? `Stempel ${stampNumber} • ${item?.typeLabel || 'Unbekannt'}`
                          : item?.typeLabel || 'Unbekannt'}
                      </Text>
                    </View>
                  </Pressable>
                  {isEditMode ? (
                    <View style={styles.pathActions}>
                      <Pressable
                        disabled={editingBlocked || index === 0}
                        onPress={() => movePoi(index, -1)}
                        style={({ pressed }) => [
                          styles.iconButton,
                          (editingBlocked || index === 0) && styles.iconButtonDisabled,
                          pressed && !editingBlocked && index !== 0 && styles.pressed,
                        ]}>
                        <Feather
                          color={editingBlocked || index === 0 ? '#9ba59a' : '#2e3a2e'}
                          name="arrow-up"
                          size={14}
                        />
                      </Pressable>

                      <Pressable
                        disabled={editingBlocked || index === draftPoiIds.length - 1}
                        onPress={() => movePoi(index, 1)}
                        style={({ pressed }) => [
                          styles.iconButton,
                          (editingBlocked || index === draftPoiIds.length - 1) && styles.iconButtonDisabled,
                          pressed && !editingBlocked && index !== draftPoiIds.length - 1 && styles.pressed,
                        ]}>
                        <Feather
                          color={editingBlocked || index === draftPoiIds.length - 1 ? '#9ba59a' : '#2e3a2e'}
                          name="arrow-down"
                          size={14}
                        />
                      </Pressable>

                      <Pressable
                        disabled={editingBlocked}
                        onPress={() => removePoiAtIndex(index)}
                        style={({ pressed }) => [
                          styles.iconButton,
                          editingBlocked && styles.iconButtonDisabled,
                          pressed && !editingBlocked && styles.pressed,
                        ]}>
                        <Feather color={editingBlocked ? '#9ba59a' : '#a34e4e'} name="trash-2" size={14} />
                      </Pressable>
                    </View>
                  ) : item ? (
                    <View style={styles.pathActions}>
                      <Pressable
                        onPress={() => openListItemDetailPage(item)}
                        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                        <Text style={styles.pathNavButtonLabel}>{'>'}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {isEditMode ? (
          <Pressable
            disabled={isSaveDisabled}
            onPress={() => void performSave(draftPoiIds, { manual: true })}
            style={({ pressed }) => [
              styles.primaryButton,
              isSaveDisabled && styles.primaryButtonDisabled,
              pressed && !isSaveDisabled && styles.pressed,
            ]}>
            <Text style={styles.primaryButtonLabel}>{saveButtonLabel}</Text>
          </Pressable>
        ) : null}

        {isFetching ? <Text style={styles.refreshHint}>Aktualisiere Tourdaten im Hintergrund...</Text> : null}
      </ScrollView>

      <Modal
        animationType="none"
        visible={isMapFullscreen}
        onRequestClose={closeMapFullscreen}>
        <View style={styles.mapFullscreenSafeArea}>
          <Animated.View style={[styles.mapFullscreenContent, fullscreenAnimatedStyle]}>
            {renderTourMap(true)}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f3ee',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 12,
  },
  headerWrap: {
    gap: 6,
    paddingHorizontal: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareHeaderButton: {
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: '#edf2fc',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  shareHeaderButtonLabel: {
    color: '#3a4f84',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  saveHeaderButton: {
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: '#2e6b4b',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  saveHeaderButtonDisabled: {
    backgroundColor: '#b8c7bb',
  },
  saveHeaderButtonLabel: {
    color: '#f5f3ee',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  modeHeaderButton: {
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: '#eef4ee',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  modeHeaderButtonDisabled: {
    opacity: 0.7,
  },
  modeHeaderButtonLabel: {
    color: '#2e6b4b',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  modeHeaderButtonLabelDisabled: {
    color: '#9ba59a',
  },
  cancelHeaderButton: {
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: '#fff4ec',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cancelHeaderButtonDisabled: {
    opacity: 0.7,
  },
  cancelHeaderButtonLabel: {
    color: '#8a5a3a',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  cancelHeaderButtonLabelDisabled: {
    color: '#b8a8a8',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  deleteHeaderButton: {
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: '#fff2f2',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  deleteHeaderButtonDisabled: {
    opacity: 0.7,
  },
  deleteHeaderButtonLabel: {
    color: '#a34e4e',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  deleteHeaderButtonLabelDisabled: {
    color: '#b8a8a8',
  },
  titleInputShell: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9ddcf',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  titleInput: {
    color: '#2e3a2e',
    fontSize: 23,
    lineHeight: 30,
    fontFamily: 'serif',
    paddingVertical: 0,
  },
  titleInputDisabled: {
    color: '#7f8a7f',
  },
  title: {
    color: '#1e2a1e',
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'serif',
  },
  subtitle: {
    color: '#445244',
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  profileStatusText: {
    color: '#2e6b4b',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  cardLine: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  warningBanner: {
    borderRadius: 16,
    backgroundColor: '#fff6ea',
    borderWidth: 1,
    borderColor: '#efd9b7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  warningTitle: {
    color: '#6b4d14',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  warningBody: {
    color: '#7d6a45',
    fontSize: 12,
    lineHeight: 16,
  },
  mapCard: {
    height: 440,
    borderRadius: 22,
    overflow: 'visible',
    backgroundColor: '#e7ebde',
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 6,
  },
  mapCardFullscreen: {
    flex: 1,
    height: undefined,
    borderRadius: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  mapFullscreenSafeArea: {
    flex: 1,
    backgroundColor: '#1e2a1e',
  },
  mapFullscreenContent: {
    flex: 1,
  },
  mapTopBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  mapTopControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapSearchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  mapFullscreenButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  mapSearchInput: {
    flex: 1,
    color: '#2e3a2e',
    fontSize: 12,
    lineHeight: 16,
    paddingVertical: 0,
  },
  searchResultsPopover: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 6,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 4,
  },
  searchResultRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  searchResultTitle: {
    color: '#1e2a1e',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  searchResultMeta: {
    color: '#6b7a6b',
    fontSize: 11,
    lineHeight: 14,
  },
  mapZoomControls: {
    position: 'absolute',
    right: 12,
    top: 74,
    gap: 8,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  zoomButtonLabel: {
    color: '#2e3a2e',
    fontSize: 20,
    lineHeight: 22,
  },
  markerFallback: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#c1a093',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  markerFallbackInTour: {
    backgroundColor: '#2e6b4b',
  },
  markerFallbackParking: {
    backgroundColor: '#2f7dd7',
  },
  markerFallbackSelected: {
    borderColor: '#1e2a1e',
    transform: [{ scale: 1.08 }],
  },
  markerFallbackLabel: {
    color: '#f5f3ee',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
  markerFallbackLabelInTour: {
    color: '#f5f3ee',
  },
  mapBottomSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  mapBottomInfoTap: {
    borderRadius: 10,
    paddingVertical: 2,
  },
  mapBottomInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapBottomArtwork: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  mapBottomInfoCopy: {
    flex: 1,
    minWidth: 1,
    gap: 2,
  },
  mapBottomOpenHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 6,
  },
  mapBottomOpenLabel: {
    color: '#4d5b4d',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  mapBottomTitle: {
    color: '#1e2a1e',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  mapBottomMeta: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  addButton: {
    backgroundColor: '#2e6b4b',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#b8c7bb',
  },
  addButtonLabel: {
    color: '#f5f3ee',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#f5f3ee',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pathOpenable: {
    flex: 1,
    minWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 2,
  },
  pathArtwork: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  pathArtworkFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#a3aea2',
  },
  pathArtworkFallbackLabel: {
    color: '#f5f3ee',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
  },
  pathCopy: {
    flex: 1,
    minWidth: 1,
    gap: 2,
  },
  pathTitle: {
    color: '#2e3a2e',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  pathMeta: {
    color: '#748074',
    fontSize: 11,
    lineHeight: 14,
  },
  pathActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pathNavButtonLabel: {
    color: '#2e3a2e',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDisabled: {
    backgroundColor: '#f0f2ee',
  },
  primaryButton: {
    backgroundColor: '#2e6b4b',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonDisabled: {
    backgroundColor: '#b8c7bb',
  },
  primaryButtonLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
  refreshHint: {
    color: '#4d6d56',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  helperText: {
    color: '#496149',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#3d2a15',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorBody: {
    color: '#655d4a',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
