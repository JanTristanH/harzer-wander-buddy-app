import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StampListItem } from '@/components/stamp-list-item';
import { useStampsOverviewQuery } from '@/lib/queries';

type FilterKey = 'all' | 'visited' | 'open' | 'near';
type LocationState = 'idle' | 'loading' | 'granted' | 'denied';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'visited', label: 'Besucht' },
  { key: 'open', label: 'Unbesucht' },
  { key: 'near', label: 'In der Nähe' },
];

const NEARBY_DISTANCE_KM = 5;
const emptySearchIllustration = require('@/assets/images/buddy/telescope.png');
const emptyVisitedIllustration = require('@/assets/images/buddy/emptyNotebook.png');

function haversineDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude?: number; longitude?: number }
) {
  if (typeof to.latitude !== 'number' || typeof to.longitude !== 'number') {
    return null;
  }

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

function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) {
    return 'Keine Distanz';
  }

  return `${distanceKm.toFixed(1).replace('.', ',')} km`;
}

function formatVisitDate(value?: string) {
  if (!value) {
    return 'Unbekanntes Datum';
  }

  return new Date(value).toLocaleString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StampsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const { data, error, isFetching, isPending, refetch } = useStampsOverviewQuery();
  const stamps = data?.stamps ?? [];
  const lastVisited = data?.lastVisited ?? null;
  const isRefreshing = isFetching && !isPending;
  const blockingError = !data ? error : null;

  useEffect(() => {
    let isMounted = true;

    async function loadLocation() {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
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

  const stampDistances = stamps.map((stamp) => ({
    stamp,
    distanceKm: userLocation ? haversineDistanceKm(userLocation, stamp) : null,
  }));

  const visitedCount = stamps.filter((stamp) => stamp.hasVisited).length;
  const totalCount = stamps.length;
  const progressPercent = totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : 0;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredStamps = stampDistances.filter(({ stamp, distanceKm }) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      stamp.name.toLowerCase().includes(normalizedQuery) ||
      (stamp.number || '').toLowerCase().includes(normalizedQuery);

    if (!matchesQuery) {
      return false;
    }

    if (activeFilter === 'visited') {
      return !!stamp.hasVisited;
    }

    if (activeFilter === 'open') {
      return !stamp.hasVisited;
    }

    if (activeFilter === 'near') {
      return distanceKm !== null && distanceKm <= NEARBY_DISTANCE_KM;
    }

    return true;
  });
  const isVisitedEmptyState = activeFilter === 'visited' && visitedCount === 0;
  const emptyStateTitle = isVisitedEmptyState ? 'Noch keine Stempelstellen besucht' : 'Keine passenden Stempelstellen';
  const emptyStateCopy = isVisitedEmptyState
    ? 'Sobald du deine erste Stempelstelle besuchst, erscheint sie hier.'
    : 'Probier eine andere Suche oder waehle einen anderen Filter.';
  const emptyStateIllustration = isVisitedEmptyState ? emptyVisitedIllustration : emptySearchIllustration;

  type ListEntry =
    | { type: 'intro'; key: 'intro' }
    | { type: 'controls'; key: 'controls' }
    | { type: 'empty'; key: 'empty' }
    | {
        type: 'stamp';
        key: string;
        stampIndex: number;
        stampItem: (typeof filteredStamps)[number];
      };

  const listItems: ListEntry[] = [{ type: 'intro', key: 'intro' }, { type: 'controls', key: 'controls' }];

  if (filteredStamps.length === 0) {
    listItems.push({ type: 'empty', key: 'empty' });
  } else {
    filteredStamps.forEach((stampItem, stampIndex) => {
      listItems.push({
        type: 'stamp',
        key: `stamp-${stampItem.stamp.ID}`,
        stampIndex,
        stampItem,
      });
    });
  }

  const renderIntro = () => (
    <View style={styles.introContent}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Stempelstellen</Text>
        <Text style={styles.totalLabel}>{totalCount} gesamt</Text>
      </View>

      <LinearGradient colors={['#3f8158', '#60926f', '#d2c18f']} style={styles.progressCard}>
        <Text style={styles.progressEyebrow}>Dein Fortschritt</Text>
        <Text style={styles.progressTitle}>
          {visitedCount} von {totalCount} Stempelstellen
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressPercent}>{progressPercent}%</Text>
        </View>
        <Text style={styles.progressHint}>
          {lastVisited
            ? `Letzter Besuch: Stempel ${lastVisited.stampNumber || '--'} • ${lastVisited.stampName} • ${formatVisitDate(lastVisited.visitedAt)}`
            : 'Noch keine besuchten Stempelstellen'}
        </Text>
      </LinearGradient>

      {isRefreshing ? <Text style={styles.refreshHint}>Aktualisiere Daten im Hintergrund...</Text> : null}
    </View>
  );

  const renderControls = () => (
    <View style={styles.controlsContent}>
      <View style={styles.searchShell}>
        <View style={styles.searchIconWrap}>
          <Feather color="#6d7d6e" name="search" size={14} />
        </View>
        <TextInput
          onChangeText={setQuery}
          placeholder="Suche nach Nummer oder Ort"
          placeholderTextColor="#7b8776"
          style={styles.searchInput}
          value={query}
        />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              onPress={() => setActiveFilter(filter.key)}
              style={({ pressed }) => [
                styles.filterPill,
                isActive && styles.filterPillActive,
                pressed && styles.filterPillPressed,
              ]}>
              <Text style={[styles.filterPillLabel, isActive && styles.filterPillLabelActive]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeFilter === 'near' && locationState !== 'granted' ? (
        <Text style={styles.filterHint}>
          Standortfreigabe fehlt. Aktiviere sie im Onboarding oder in den Systemeinstellungen.
        </Text>
      ) : null}
    </View>
  );

  if (isPending && !data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6b4b" size="large" />
          <Text style={styles.helperText}>Lade Stempelstellen aus dem OData-v4-Service...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (blockingError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Stempelstellen konnten nicht geladen werden</Text>
          <Text style={styles.errorBody}>{blockingError.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.type === 'intro') {
            return <View style={styles.introWrap}>{renderIntro()}</View>;
          }

          if (item.type === 'controls') {
            return (
              <View style={styles.controlsWrap}>
                {renderControls()}
              </View>
            );
          }

          if (item.type === 'empty') {
            return (
              <View style={styles.emptyStateWrap}>
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>{emptyStateTitle}</Text>
                  <Image
                    contentFit="contain"
                    source={emptyStateIllustration}
                    style={styles.emptyIllustration}
                  />
                  <Text style={styles.emptyCopy}>{emptyStateCopy}</Text>
                </View>
              </View>
            );
          }

          return (
            <View style={styles.stampRow}>
              <StampListItem
                index={item.stampIndex}
                item={item.stampItem.stamp}
                metaLabel={formatDistance(item.stampItem.distanceKm)}
                onPress={() => router.push(`/stamps/${item.stampItem.stamp.ID}` as never)}
              />
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
        contentInset={{ bottom: 160 }}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              void (async () => {
                setIsPullRefreshing(true);
                try {
                  await refetch();
                } finally {
                  setIsPullRefreshing(false);
                }
              })();
            }}
            refreshing={isPullRefreshing}
            tintColor="#2e6b4b"
          />
        }
        stickyHeaderIndices={[1]}
        scrollIndicatorInsets={{ bottom: 160 }}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f3ee',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 20,
    paddingBottom: 220,
  },
  introWrap: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  introContent: {
    gap: 12,
  },
  controlsWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#f5f3ee',
  },
  controlsContent: {
    gap: 12,
  },
  stampRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#1e2a1e',
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'serif',
  },
  totalLabel: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  progressCard: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 6,
  },
  progressEyebrow: {
    color: '#f5f3ee',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    opacity: 0.9,
    textTransform: 'uppercase',
  },
  progressTitle: {
    color: '#f5f3ee',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f5f3ee',
  },
  progressPercent: {
    color: '#f5f3ee',
    fontSize: 12,
    lineHeight: 16,
  },
  progressHint: {
    color: '#f5f3ee',
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.9,
  },
  refreshHint: {
    color: '#4d6d56',
    fontSize: 13,
    marginTop: 12,
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  searchIconWrap: {
    width: 16,
    height: 16,
    borderRadius: 6,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    color: '#2e3a2e',
    fontSize: 13,
    lineHeight: 16,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterPill: {
    borderRadius: 999,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterPillActive: {
    backgroundColor: '#2e6b4b',
  },
  filterPillPressed: {
    opacity: 0.85,
  },
  filterPillLabel: {
    color: '#2e3a2e',
    fontSize: 12,
    lineHeight: 16,
  },
  filterPillLabelActive: {
    color: '#f5f3ee',
  },
  filterHint: {
    color: '#7f6a43',
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
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
  emptyState: {
    backgroundColor: '#fffaf0',
    borderRadius: 22,
    padding: 20,
    gap: 8,
  },
  emptyStateWrap: {
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: '#2e3a2e',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyCopy: {
    color: '#6b7a6b',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyIllustration: {
    width: 120,
    height: 120,
    alignSelf: 'center',
  },
});
