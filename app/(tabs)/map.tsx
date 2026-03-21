import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapSelectionSheet } from '@/components/map-selection-sheet';
import { createStamping, type MapParkingSpot, type MapStamp } from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';
import { queryKeys, useMapDataQuery } from '@/lib/queries';

type VisitFilter = 'all' | 'visited' | 'open';
type MarkerKind = MapStamp['kind'] | MapParkingSpot['kind'];

type Coordinate = {
  latitude: number;
  longitude: number;
};

type LocationState = 'idle' | 'loading' | 'granted' | 'denied';
type AuthClaims = {
  sub?: string;
};

type BaseMarkerItem = {
  id: string;
  kind: MarkerKind;
  coordinate: Coordinate;
  title: string;
  description?: string;
  imageUrl?: string;
};

type StampMarkerItem = BaseMarkerItem & {
  kind: MapStamp['kind'];
  number?: string;
  stampId: string;
  visitedAt?: string;
};

type ParkingMarkerItem = BaseMarkerItem & {
  kind: 'parking';
  parkingId: string;
};

type MarkerItem = StampMarkerItem | ParkingMarkerItem;

type ClusterMarkerItem = {
  id: string;
  kind: 'cluster';
  clusterKind: MarkerKind;
  count: number;
  coordinate: Coordinate;
  members: MarkerItem[];
};

const HARZ_REGION: Region = {
  latitude: 51.7544,
  longitude: 10.6182,
  latitudeDelta: 0.42,
  longitudeDelta: 0.42,
};

const CLUSTER_MIN_LONGITUDE_DELTA = 0.16;
const CLUSTER_EXPANDED_LONGITUDE_DELTA = 0.08;
const PARKING_HIDE_LONGITUDE_DELTA = 0.12;
const MIN_ZOOM_DELTA = 0.0075;
const MAX_ZOOM_DELTA = 1.2;
const MAP_EDGE_PADDING = { top: 140, right: 64, bottom: 260, left: 64 };
const TAB_BAR_HEIGHT = 72;
const TAB_BAR_MARGIN_BOTTOM = 20;
const SHEET_TO_TAB_BAR_GAP = 8;
const ZOOM_CONTROLS_GAP = 16;
const SEARCH_RESULT_LIMIT = 6;
const SEARCH_TARGET_DELTA = 0.06;
const SELECTION_TARGET_DELTA = 0.08;
const LOCATE_ME_TARGET_DELTA = 0.05;
const SELECTION_TARGET_VERTICAL_RATIO = 0.3;
const SINGLE_POINT_FOCUS_OFFSET_RATIO = 0.15;
const NORTH_HEADING_EPSILON = 2;
const MARKER_ANCHOR = { x: 0.5, y: 1 };

let lastMapRegion: Region | null = null;

const VISIT_FILTERS: { key: VisitFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'visited', label: 'Besucht' },
  { key: 'open', label: 'Unbesucht' },
];

function hasCoordinate<T extends { latitude?: number; longitude?: number }>(
  value?: T
): value is T & Coordinate {
  return typeof value?.latitude === 'number' && typeof value?.longitude === 'number';
}

function formatVisitDate(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function markerColors(kind: MarkerKind) {
  if (kind === 'visited-stamp') {
    return {
      fill: '#2e6b4b',
      shadow: 'rgba(20,30,20,0.22)',
      text: '#f5f3ee',
      badgeFill: '#deebe2',
      badgeText: '#2e6b4b',
    };
  }

  if (kind === 'open-stamp') {
    return {
      fill: '#c1a093',
      shadow: 'rgba(20,30,20,0.18)',
      text: '#f5f3ee',
      badgeFill: '#f0e7e0',
      badgeText: '#7d5f52',
    };
  }

  return {
    fill: '#2f7dd7',
    shadow: 'rgba(24,57,99,0.18)',
    text: '#f5f3ee',
    badgeFill: '#e3effc',
    badgeText: '#2f7dd7',
  };
}

function clampDelta(value: number) {
  return Math.min(MAX_ZOOM_DELTA, Math.max(MIN_ZOOM_DELTA, value));
}

function normalizeHeading(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function createSinglePointRegion(coordinate: Coordinate, longitudeDelta: number): Region {
  const clampedLongitudeDelta = clampDelta(longitudeDelta);
  const latitudeDelta = clampDelta(clampedLongitudeDelta);

  return {
    latitude: coordinate.latitude - latitudeDelta * SINGLE_POINT_FOCUS_OFFSET_RATIO,
    longitude: coordinate.longitude,
    latitudeDelta,
    longitudeDelta: clampedLongitudeDelta,
  };
}

function createPointRegionAtVerticalRatio(
  coordinate: Coordinate,
  longitudeDelta: number,
  verticalRatio: number
): Region {
  const clampedLongitudeDelta = clampDelta(longitudeDelta);
  const latitudeDelta = clampDelta(clampedLongitudeDelta);
  const centerOffsetRatio = verticalRatio - 0.5;

  return {
    latitude: coordinate.latitude + latitudeDelta * centerOffsetRatio,
    longitude: coordinate.longitude,
    latitudeDelta,
    longitudeDelta: clampedLongitudeDelta,
  };
}

function createClusterMarkers(items: StampMarkerItem[], region: Region, clusteringEnabled: boolean) {
  const shouldCluster =
    clusteringEnabled &&
    region.longitudeDelta >= CLUSTER_MIN_LONGITUDE_DELTA &&
    region.longitudeDelta > CLUSTER_EXPANDED_LONGITUDE_DELTA;

  if (!shouldCluster) {
    return items;
  }

  const latitudeBucketSize = Math.max(region.latitudeDelta / 6, 0.015);
  const longitudeBucketSize = Math.max(region.longitudeDelta / 6, 0.015);
  const buckets = new Map<string, MarkerItem[]>();

  for (const item of items) {
    const latBucket = Math.floor(item.coordinate.latitude / latitudeBucketSize);
    const lngBucket = Math.floor(item.coordinate.longitude / longitudeBucketSize);
    const key = `${item.kind}:${latBucket}:${lngBucket}`;
    const currentBucket = buckets.get(key);

    if (currentBucket) {
      currentBucket.push(item);
    } else {
      buckets.set(key, [item]);
    }
  }

  return Array.from(buckets.entries()).map(([key, members]) => {
    if (members.length === 1) {
      return members[0];
    }

    const coordinate = members.reduce(
      (accumulator, member) => ({
        latitude: accumulator.latitude + member.coordinate.latitude / members.length,
        longitude: accumulator.longitude + member.coordinate.longitude / members.length,
      }),
      { latitude: 0, longitude: 0 }
    );

    return {
      id: `cluster:${key}`,
      kind: 'cluster' as const,
      clusterKind: members[0].kind,
      count: members.length,
      coordinate,
      members,
    };
  });
}

function haversineDistanceKm(from: Coordinate, to: Coordinate) {
  const toRad = (value: number) => (value * Math.PI) / 180;
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

function formatDistance(distanceKm: number) {
  return `${distanceKm.toFixed(1).replace('.', ',')} km`;
}

function zoomRegion(region: Region, factor: number) {
  return {
    ...region,
    latitudeDelta: clampDelta(region.latitudeDelta * factor),
    longitudeDelta: clampDelta(region.longitudeDelta * factor),
  };
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

export default function MapScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    stampId?: string | string[];
    parkingId?: string | string[];
  }>();
  const { accessToken, logout } = useAuth();
  const claims = useIdTokenClaims<AuthClaims>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const mapRef = useRef<MapView | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const requestedStampId = Array.isArray(params.stampId) ? params.stampId[0] : params.stampId;
  const requestedParkingId = Array.isArray(params.parkingId) ? params.parkingId[0] : params.parkingId;
  const initialRegion = lastMapRegion ?? HARZ_REGION;
  const regionRef = useRef<Region>(initialRegion);
  const hasFittedInitialRegion = useRef(lastMapRegion !== null);
  const lastMarkerPressAtRef = useRef(0);
  const handledRequestedStampIdRef = useRef<string | null>(null);
  const handledRequestedParkingIdRef = useRef<string | null>(null);
  const { data, error, isFetching, isPending, isPlaceholderData } = useMapDataQuery();
  const [region, setRegion] = useState<Region>(initialRegion);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('all');
  const [showStamps, setShowStamps] = useState(true);
  const [showParking, setShowParking] = useState(false);
  const [clusteringEnabled] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isStamping, setIsStamping] = useState(false);
  const [selectedSheetHeight, setSelectedSheetHeight] = useState(0);
  const [mapHeading, setMapHeading] = useState(0);
  const showStartupLoading = (isPending && !data) || isPlaceholderData;
  const isMapNorthUp = Math.abs(normalizeHeading(mapHeading)) <= NORTH_HEADING_EPSILON;

  const updateMapRegion = useCallback((nextRegion: Region) => {
    regionRef.current = nextRegion;
    setRegion(nextRegion);
    lastMapRegion = nextRegion;
  }, []);

  const fitCoordinates = useCallback((coordinates: Coordinate[]) => {
    if (!mapRef.current || coordinates.length === 0) {
      return;
    }

    if (coordinates.length === 1) {
      const [coordinate] = coordinates;
      const nextRegion = createSinglePointRegion(coordinate, 0.08);
      updateMapRegion(nextRegion);
      mapRef.current.animateToRegion(nextRegion, 250);
      return;
    }

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: MAP_EDGE_PADDING,
      animated: true,
    });
  }, [updateMapRegion]);

  const stampItems = useMemo<StampMarkerItem[]>(() => {
    if (!data) {
      return [];
    }

    return data.stamps
      .filter(hasCoordinate)
      .map((stamp) => ({
        id: `stamp:${stamp.ID}`,
        kind: stamp.kind,
        coordinate: { latitude: stamp.latitude, longitude: stamp.longitude },
        title: `${stamp.number || '--'} • ${stamp.name}`,
        description: stamp.description?.trim() || undefined,
        imageUrl: stamp.heroImageUrl?.trim() || stamp.image?.trim() || undefined,
        number: stamp.number,
        stampId: stamp.ID,
        visitedAt: stamp.visitedAt,
      }));
  }, [data]);

  const parkingItems = useMemo<ParkingMarkerItem[]>(() => {
    if (!data) {
      return [];
    }

    return data.parkingSpots
      .filter(hasCoordinate)
      .map((parkingSpot) => ({
        id: `parking:${parkingSpot.ID}`,
        kind: 'parking',
        coordinate: { latitude: parkingSpot.latitude, longitude: parkingSpot.longitude },
        title: parkingSpot.name?.trim() || 'Parkplatz',
        description: parkingSpot.description?.trim() || undefined,
        parkingId: parkingSpot.ID,
      }));
  }, [data]);

  const visibleStampItems = useMemo(() => {
    return stampItems.filter((item) => {
      if (!showStamps) {
        return false;
      }

      if (visitFilter === 'visited') {
        return item.kind === 'visited-stamp';
      }

      if (visitFilter === 'open') {
        return item.kind === 'open-stamp';
      }

      return true;
    });
  }, [showStamps, stampItems, visitFilter]);

  const visibleParkingItems = useMemo(() => {
    if (!showParking) {
      return [];
    }

    if (clusteringEnabled && region.longitudeDelta >= PARKING_HIDE_LONGITUDE_DELTA) {
      return [];
    }

    return parkingItems;
  }, [clusteringEnabled, parkingItems, region.longitudeDelta, showParking]);

  const visibleItems = useMemo<MarkerItem[]>(
    () => [...visibleStampItems, ...visibleParkingItems],
    [visibleParkingItems, visibleStampItems]
  );

  const renderedStampMarkers = useMemo(
    () => createClusterMarkers(visibleStampItems, region, clusteringEnabled),
    [clusteringEnabled, region, visibleStampItems]
  );

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedItemId) ?? null,
    [selectedItemId, visibleItems]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadLocation() {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted && permission.canAskAgain) {
          permission = await Location.requestForegroundPermissionsAsync();
        }

        if (!isMounted) {
          return;
        }

        if (!permission.granted) {
          setLocationState(permission.status === 'denied' ? 'denied' : 'idle');
          return;
        }

        setLocationState('loading');
        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!isMounted) {
          return;
        }

        setUserLocation({
          latitude: currentPosition.coords.latitude,
          longitude: currentPosition.coords.longitude,
        });
        setLocationState('granted');
      } catch {
        if (!isMounted) {
          return;
        }

        setLocationState('denied');
      }
    }

    void loadLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }

    const itemStillVisible = visibleItems.some((item) => item.id === selectedItemId);
    if (!itemStillVisible) {
      setSelectedItemId(null);
    }
  }, [selectedItemId, visibleItems]);

  useEffect(() => {
    if (!isMapReady || !data || hasFittedInitialRegion.current) {
      return;
    }

    const coordinates = [...stampItems, ...parkingItems].map((item) => item.coordinate);
    if (coordinates.length > 0) {
      fitCoordinates(coordinates);
      hasFittedInitialRegion.current = true;
    }
  }, [data, fitCoordinates, isMapReady, parkingItems, stampItems]);

  const searchResults = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(searchQuery);
    if (!normalizedQuery) {
      return [];
    }

    return visibleItems
      .filter((item) => {
        const normalizedTitle = item.title.toLowerCase();
        const normalizedDescription = item.description?.toLowerCase() || '';
        return (
          normalizedTitle.includes(normalizedQuery) || normalizedDescription.includes(normalizedQuery)
        );
      })
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [searchQuery, visibleItems]);

  const nearestParkingMeta = useMemo(() => {
    if (!selectedItem || selectedItem.kind === 'parking' || parkingItems.length === 0) {
      return null;
    }

    let nearestParking: ParkingMarkerItem | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const parkingItem of parkingItems) {
      const distanceKm = haversineDistanceKm(selectedItem.coordinate, parkingItem.coordinate);
      if (distanceKm < nearestDistance) {
        nearestDistance = distanceKm;
        nearestParking = parkingItem;
      }
    }

    if (!nearestParking || !Number.isFinite(nearestDistance)) {
      return null;
    }

    return `Parken: ${nearestParking.title} • ${formatDistance(nearestDistance)}`;
  }, [parkingItems, selectedItem]);

  const sheetBottomOffset = TAB_BAR_HEIGHT + TAB_BAR_MARGIN_BOTTOM + SHEET_TO_TAB_BAR_GAP;
  const zoomControlsBottomOffset =
    sheetBottomOffset +
    (selectedItem ? selectedSheetHeight + ZOOM_CONTROLS_GAP : ZOOM_CONTROLS_GAP);
  const filterPopoverWidth = useMemo(() => Math.min(300, Math.max(windowWidth - 32, 0)), [windowWidth]);
  const compassButtonTopOffset = insets.top + 64;

  const syncMapHeading = useCallback(async () => {
    if (!mapRef.current) {
      return;
    }

    try {
      const camera = await mapRef.current.getCamera();
      setMapHeading(camera.heading);
    } catch {
      // Ignore native map camera read errors.
    }
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const nextRegion = zoomRegion(regionRef.current, factor);
      updateMapRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 180);
    },
    [updateMapRegion]
  );

  const handleClusterPress = useCallback(
    (cluster: ClusterMarkerItem) => {
      lastMarkerPressAtRef.current = Date.now();
      fitCoordinates(cluster.members.map((member) => member.coordinate));
    },
    [fitCoordinates]
  );

  const handleMarkerPress = useCallback(
    (item: MarkerItem) => {
      lastMarkerPressAtRef.current = Date.now();
      setSelectedItemId(item.id);
      const targetDelta = Math.min(regionRef.current.longitudeDelta, SELECTION_TARGET_DELTA);
      const nextRegion = createPointRegionAtVerticalRatio(
        item.coordinate,
        targetDelta,
        SELECTION_TARGET_VERTICAL_RATIO
      );
      updateMapRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 260);
    },
    [updateMapRegion]
  );

  const handleLocateMePress = useCallback(() => {
    if (!userLocation) {
      return;
    }

    const targetDelta = Math.min(regionRef.current.longitudeDelta, LOCATE_ME_TARGET_DELTA);
    const nextRegion = createSinglePointRegion(userLocation, targetDelta);
    updateMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 260);
  }, [updateMapRegion, userLocation]);

  const handleStampVisit = useCallback(async () => {
    if (!accessToken || !selectedItem || selectedItem.kind === 'parking' || isStamping) {
      return;
    }

    if (selectedItem.kind === 'visited-stamp') {
      return;
    }

    setIsStamping(true);

    try {
      await createStamping(accessToken, selectedItem.stampId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.stampsOverview(claims?.sub) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mapData(claims?.sub) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profileOverview(claims?.sub) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.stampDetail(claims?.sub, selectedItem.stampId),
        }),
      ]);
      Alert.alert('Besuch gespeichert', 'Die Stempelstelle wurde erfolgreich gestempelt.');
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
        await logout();
        return;
      }

      Alert.alert(
        'Stempeln fehlgeschlagen',
        nextError instanceof Error ? nextError.message : 'Unbekannter Fehler'
      );
    } finally {
      setIsStamping(false);
    }
  }, [accessToken, claims?.sub, isStamping, logout, queryClient, selectedItem]);

  const focusItemOnMap = useCallback((item: MarkerItem) => {
    lastMarkerPressAtRef.current = Date.now();
    setSelectedItemId(item.id);
    setSearchQuery('');
    setIsSearchFocused(false);
    searchInputRef.current?.blur();

    const nextRegion = {
      ...createPointRegionAtVerticalRatio(
        item.coordinate,
        SEARCH_TARGET_DELTA,
        SELECTION_TARGET_VERTICAL_RATIO
      ),
    };

    updateMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 260);
  }, [updateMapRegion]);

  useEffect(() => {
    if (!requestedStampId) {
      handledRequestedStampIdRef.current = null;
      return;
    }

    if (!isMapReady || handledRequestedStampIdRef.current === requestedStampId) {
      return;
    }

    const requestedItem = stampItems.find((item) => item.stampId === requestedStampId);
    if (!requestedItem) {
      return;
    }

    setShowStamps(true);
    setVisitFilter('all');
    focusItemOnMap(requestedItem);
    handledRequestedStampIdRef.current = requestedStampId;
  }, [focusItemOnMap, isMapReady, requestedStampId, stampItems]);

  useEffect(() => {
    if (!requestedParkingId) {
      handledRequestedParkingIdRef.current = null;
      return;
    }

    if (!isMapReady || handledRequestedParkingIdRef.current === requestedParkingId) {
      return;
    }

    const requestedItem = parkingItems.find((item) => item.parkingId === requestedParkingId);
    if (!requestedItem) {
      return;
    }

    setShowParking(true);
    focusItemOnMap(requestedItem);
    handledRequestedParkingIdRef.current = requestedParkingId;
  }, [focusItemOnMap, isMapReady, parkingItems, requestedParkingId]);

  const handleRegionChangeComplete = useCallback((nextRegion: Region) => {
    updateMapRegion(nextRegion);
    void syncMapHeading();
  }, [syncMapHeading, updateMapRegion]);

  const handleResetNorthPress = useCallback(() => {
    mapRef.current?.animateCamera(
      {
        heading: 0,
        pitch: 0,
      },
      { duration: 220 }
    );
    setMapHeading(0);
  }, []);

  const selectionPrimaryActionLabel = useMemo(() => {
    if (!selectedItem || selectedItem.kind === 'parking') {
      return undefined;
    }

    if (isStamping) {
      return 'Registriere Besuch...';
    }

    return selectedItem.kind === 'visited-stamp' ? 'Bereits gestempelt' : 'Besuch registrieren';
  }, [isStamping, selectedItem]);

  const selectionPrimaryActionDisabled = useMemo(() => {
    if (!selectedItem || selectedItem.kind === 'parking') {
      return true;
    }

    return isStamping || selectedItem.kind === 'visited-stamp' || !accessToken;
  }, [accessToken, isStamping, selectedItem]);

  return (
    <View style={styles.screen}>
      {showStartupLoading || isFetching ? (
        <View style={styles.refreshBadge}>
          <Text style={styles.refreshBadgeText}>
            {showStartupLoading ? 'Lade Kartenpunkte...' : 'Aktualisiere Kartenpunkte...'}
          </Text>
        </View>
      ) : null}
      <MapView
        ref={mapRef}
        initialRegion={initialRegion}
        onMapReady={() => {
          setIsMapReady(true);
          void syncMapHeading();
        }}
        onUserLocationChange={(event) => {
          setUserLocation({
            latitude: event.nativeEvent.coordinate.latitude,
            longitude: event.nativeEvent.coordinate.longitude,
          });
          setLocationState('granted');
        }}
        onPress={() => {
          if (Date.now() - lastMarkerPressAtRef.current < 250) {
            return;
          }

          setSelectedItemId(null);
          setIsSearchFocused(false);
        }}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsCompass={false}
        showsUserLocation={locationState !== 'denied'}
        showsMyLocationButton={false}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}>
        {renderedStampMarkers.map((item) => {
          if (item.kind === 'cluster') {
            const colors = markerColors(item.clusterKind);
            return (
              <Marker
                anchor={MARKER_ANCHOR}
                coordinate={item.coordinate}
                key={item.id}
                onPress={() => handleClusterPress(item)}>
                <View collapsable={false} style={styles.pinMarker}>
                  <View
                    style={[
                      styles.pinHead,
                      styles.clusterMarkerHead,
                      { backgroundColor: colors.fill, shadowColor: colors.shadow },
                    ]}>
                    <Text style={[styles.clusterMarkerText, { color: colors.text }]}>{item.count}</Text>
                  </View>
                  <View style={styles.pinTipWrap}>
                    <View style={[styles.pinTip, { backgroundColor: colors.fill }]} />
                  </View>
                </View>
              </Marker>
            );
          }

          const stampItem = item as StampMarkerItem;
          const colors = markerColors(stampItem.kind);
          return (
            <Marker
              anchor={MARKER_ANCHOR}
              coordinate={stampItem.coordinate}
              key={stampItem.id}
              onPress={() => handleMarkerPress(stampItem)}>
              <View collapsable={false} style={styles.pinMarker}>
                <View
                  style={[
                    styles.pinHead,
                    styles.stampMarkerHead,
                    { backgroundColor: colors.fill, shadowColor: colors.shadow },
                  ]}>
                  <Text style={[styles.stampMarkerText, { color: colors.text }]}>
                    {stampItem.number || '--'}
                  </Text>
                </View>
                <View style={styles.pinTipWrap}>
                  <View style={[styles.pinTip, { backgroundColor: colors.fill }]} />
                </View>
              </View>
            </Marker>
          );
        })}
        {visibleParkingItems.map((item) => {
          const colors = markerColors(item.kind);
          return (
            <Marker
              anchor={MARKER_ANCHOR}
              coordinate={item.coordinate}
              key={item.id}
              onPress={() => handleMarkerPress(item)}>
              <View collapsable={false} style={styles.pinMarker}>
                <View
                  style={[
                    styles.pinHead,
                    styles.parkingMarkerHead,
                    { backgroundColor: colors.fill, shadowColor: colors.shadow },
                  ]}>
                  <Text style={[styles.parkingMarkerText, { color: colors.text }]}>P</Text>
                </View>
                <View style={styles.pinTipWrap}>
                  <View style={[styles.pinTip, styles.pinTipCompact, { backgroundColor: colors.fill }]} />
                </View>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={[styles.topControls, { top: insets.top + 12 }]}>
          <View style={styles.searchBarWrap}>
            <View style={styles.searchBar}>
              <TextInput
                ref={searchInputRef}
                onBlur={() => setIsSearchFocused(false)}
                onChangeText={setSearchQuery}
                onFocus={() => setIsSearchFocused(true)}
                placeholder="Suche Stempel oder Parkplatz"
                placeholderTextColor="#7b8776"
                style={styles.searchInput}
                value={searchQuery}
              />
            </View>

            {isSearchFocused && searchResults.length > 0 ? (
              <View style={styles.searchResultsPopover}>
                {searchResults.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => focusItemOnMap(item)}
                    style={({ pressed }) => [styles.searchResultRow, pressed && styles.pressed]}>
                    <Text numberOfLines={1} style={styles.searchResultTitle}>
                      {item.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.searchResultMeta}>
                      {item.kind === 'parking' ? 'Parkplatz' : item.kind === 'visited-stamp' ? 'Besucht' : 'Unbesucht'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <Pressable onPress={() => setIsFilterOpen(true)} style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}>
            <Feather color="#1e2a1e" name="sliders" size={14} />
            <Text style={styles.filterButtonLabel}>Filter</Text>
          </Pressable>
        </View>

        {!isMapNorthUp ? (
          <View style={[styles.compassControl, { top: compassButtonTopOffset }]}>
            <Pressable onPress={handleResetNorthPress} style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
              <Feather color="#2e3a2e" name="compass" size={18} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.zoomControls, { bottom: zoomControlsBottomOffset }]}>
          <Pressable
            disabled={!userLocation}
            onPress={handleLocateMePress}
            style={({ pressed }) => [
              styles.zoomButton,
              !userLocation && styles.disabledControl,
              pressed && userLocation && styles.pressed,
            ]}>
            <Feather color={userLocation ? '#2e3a2e' : '#9ba59a'} name="crosshair" size={19} />
          </Pressable>
          <Pressable onPress={() => zoomBy(0.6)} style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
            <Text style={styles.zoomButtonLabel}>+</Text>
          </Pressable>
          <Pressable onPress={() => zoomBy(1.6)} style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
            <Text style={styles.zoomButtonLabel}>−</Text>
          </Pressable>
        </View>

        {selectedItem ? (
          <MapSelectionSheet
            bottomOffset={sheetBottomOffset}
            item={{
              kind: selectedItem.kind,
              title: selectedItem.title,
              description: selectedItem.kind === 'parking' ? undefined : selectedItem.description,
              imageUrl: selectedItem.imageUrl,
            }}
            metadata={
              selectedItem.kind === 'parking'
                ? selectedItem.description?.trim()
                : nearestParkingMeta ||
                  (formatVisitDate(selectedItem.visitedAt)
                    ? `Besucht am ${formatVisitDate(selectedItem.visitedAt)}`
                    : 'Noch kein Besuchsdatum vorhanden.')
            }
            onPrimaryActionPress={handleStampVisit}
            primaryActionDisabled={selectionPrimaryActionDisabled}
            primaryActionLabel={selectionPrimaryActionLabel}
            onDetailsPress={() =>
              selectedItem.kind === 'parking'
                ? router.push(`/parking/${selectedItem.parkingId}` as never)
                : router.push(`/stamps/${selectedItem.stampId}` as never)
            }
            onHeightChange={setSelectedSheetHeight}
          />
        ) : null}

        {error && !data ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerTitle}>Karte konnte nicht geladen werden</Text>
            <Text style={styles.errorBannerBody}>{error.message}</Text>
          </View>
        ) : null}
      </View>

      <Modal animationType="fade" onRequestClose={() => setIsFilterOpen(false)} transparent visible={isFilterOpen}>
        <View style={styles.modalBackdrop}>
          <Pressable onPress={() => setIsFilterOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={[styles.filterPopover, { top: insets.top + 72, width: filterPopoverWidth }]}>
            <Text style={styles.filterTitle}>Filter</Text>

            <Text style={styles.filterSectionLabel}>Status</Text>
            <View style={styles.filterChipRow}>
              {VISIT_FILTERS.map((filter) => {
                const disabled = !showStamps;
                const isActive = visitFilter === filter.key;

                return (
                  <Pressable
                    disabled={disabled}
                    key={filter.key}
                    onPress={() => setVisitFilter(filter.key)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      isActive && styles.filterChipActive,
                      disabled && styles.filterChipDisabled,
                      pressed && !disabled && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.filterChipLabel,
                        isActive && styles.filterChipLabelActive,
                        disabled && styles.filterChipLabelDisabled,
                      ]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.filterSectionLabel}>Inhalt</Text>
            <View style={styles.toggleList}>
              <Pressable
                onPress={() => setShowStamps((current) => !current)}
                style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}>
                <Text style={styles.toggleLabel}>Stempel</Text>
                <View style={[styles.togglePill, showStamps && styles.togglePillActive]}>
                  <View style={[styles.toggleThumb, showStamps && styles.toggleThumbActive]} />
                </View>
              </Pressable>

              <Pressable
                onPress={() => setShowParking((current) => !current)}
                style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}>
                <Text style={styles.toggleLabel}>Parkplaetze</Text>
                <View style={[styles.togglePill, showParking && styles.togglePillActive]}>
                  <View style={[styles.toggleThumb, showParking && styles.toggleThumbActive]} />
                </View>
              </Pressable>

            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#e7ebde',
  },
  refreshBadge: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    zIndex: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(245,243,238,0.96)',
    shadowColor: '#141e14',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  refreshBadgeText: {
    color: '#2e6b4b',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 110,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,250,240,0.97)',
    shadowColor: '#141e14',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  errorBannerTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  errorBannerBody: {
    color: '#6b7a6b',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  topControls: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBarWrap: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 2,
  },
  filterButton: {
    width: 92,
    flexShrink: 0,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  searchBar: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  searchInput: {
    width: '100%',
    color: '#1e2a1e',
    fontSize: 13,
    lineHeight: 18,
    padding: 0,
  },
  searchResultsPopover: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
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
  filterButtonLabel: {
    color: '#1e2a1e',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    gap: 10,
  },
  compassControl: {
    position: 'absolute',
    right: 16,
  },
  zoomButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  disabledControl: {
    opacity: 0.6,
  },
  zoomButtonLabel: {
    color: '#2e3a2e',
    fontSize: 24,
    lineHeight: 28,
  },
  pinMarker: {
    width: 56,
    height: 60,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  pinHead: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 6,
  },
  pinTipWrap: {
    marginTop: -5,
    height: 14,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pinTip: {
    width: 14,
    height: 14,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
  pinTipCompact: {
    width: 12,
    height: 12,
  },
  stampMarkerHead: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 10,
  },
  stampMarkerText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
  parkingMarkerHead: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  parkingMarkerText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
  clusterMarkerHead: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 11,
  },
  clusterMarkerText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  bottomSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 6,
  },
  bottomSheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#d8ded6',
    alignSelf: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailArtwork: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  detailCopy: {
    flex: 1,
    minWidth: 1,
  },
  detailTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  detailDescription: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  detailBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailBadgeVisited: {
    backgroundColor: '#deebe2',
  },
  detailBadgeOpen: {
    backgroundColor: '#f0e7e0',
  },
  detailBadgeParking: {
    backgroundColor: '#e3effc',
  },
  detailBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  detailBadgeTextVisited: {
    color: '#2e6b4b',
  },
  detailBadgeTextOpen: {
    color: '#7d5f52',
  },
  detailBadgeTextParking: {
    color: '#2f7dd7',
  },
  detailMeta: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailAction: {
    backgroundColor: '#2e6b4b',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailActionLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,30,20,0.16)',
  },
  filterPopover: {
    position: 'absolute',
    right: 16,
    width: 300,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 6,
  },
  filterTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  filterSectionLabel: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    backgroundColor: '#f2f0ea',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: '#2e6b4b',
  },
  filterChipDisabled: {
    opacity: 0.5,
  },
  filterChipLabel: {
    color: '#4a574a',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  filterChipLabelActive: {
    color: '#f5f3ee',
  },
  filterChipLabelDisabled: {
    color: '#8b957f',
  },
  toggleList: {
    gap: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  toggleCopy: {
    flex: 1,
    minWidth: 1,
    gap: 2,
  },
  toggleLabel: {
    color: '#1e2a1e',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  toggleHint: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  togglePill: {
    width: 48,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#d5ddd4',
    padding: 3,
    justifyContent: 'center',
  },
  togglePillActive: {
    backgroundColor: '#2e6b4b',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  pressed: {
    opacity: 0.85,
  },
});
