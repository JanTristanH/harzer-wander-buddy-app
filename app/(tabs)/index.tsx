import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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

import { fetchStampboxes, type Stampbox } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type FilterKey = 'all' | 'visited' | 'open' | 'near';
type LocationState = 'idle' | 'loading' | 'granted' | 'denied';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'visited', label: 'Besucht' },
  { key: 'open', label: 'Unbesucht' },
  { key: 'near', label: 'In der Naehe' },
];

const NEARBY_DISTANCE_KM = 5;

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

function cardGradient(index: number, visited: boolean) {
  if (visited) {
    return index % 2 === 0 ? ['#4f8b67', '#88bf99'] : ['#4e7f61', '#bfd7ac'];
  }

  return index % 2 === 0 ? ['#bcc2b6', '#ddd8ce'] : ['#aeb7aa', '#d4d1c8'];
}

function StampCard({
  item,
  index,
  distanceKm,
  onPress,
}: {
  item: Stampbox;
  index: number;
  distanceKm: number | null;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <LinearGradient colors={cardGradient(index, !!item.hasVisited)} style={styles.cardArtwork} />

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>
          {item.number || '--'} {'\u2022'} {item.name}
        </Text>
        <Text numberOfLines={2} style={styles.cardDescription}>
          {item.description?.trim() || 'Keine Beschreibung verfuegbar.'}
        </Text>

        <View style={styles.cardMetaRow}>
          <View style={[styles.statePill, item.hasVisited ? styles.statePillVisited : styles.statePillOpen]}>
            <Text
              style={[
                styles.statePillLabel,
                item.hasVisited ? styles.statePillLabelVisited : styles.statePillLabelOpen,
              ]}>
              {item.hasVisited ? 'Besucht' : 'Unbesucht'}
            </Text>
          </View>
          <Text style={styles.distanceLabel}>{formatDistance(distanceKm)}</Text>
        </View>
      </View>

      <Feather color="#8b957f" name="chevron-right" size={18} style={styles.cardChevron} />
      {item.hasVisited ? <Text style={[styles.cardMark, styles.cardMarkVisited]}>✓</Text> : null}
    </Pressable>
  );
}

export default function StampsScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const [stamps, setStamps] = useState<Stampbox[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const loadStamps = useCallback(
    async (refresh = false) => {
      if (!accessToken) {
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const nextStamps = await fetchStampboxes(accessToken);
        setStamps(nextStamps);
        setError(null);
      } catch (nextError) {
        if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
          await logout();
          return;
        }

        setError(nextError instanceof Error ? nextError.message : 'Unknown error');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, logout]
  );

  useEffect(() => {
    void loadStamps();
  }, [loadStamps]);

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
  const lastVisited = stamps.find((stamp) => stamp.hasVisited);

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

  const header = (
    <View style={styles.headerContent}>
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
            ? `Letzter Besuch: Stempel ${lastVisited.number || '--'} • ${lastVisited.name}`
            : 'Noch keine besuchten Stempelstellen'}
        </Text>
      </LinearGradient>

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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6b4b" size="large" />
          <Text style={styles.helperText}>Lade Stempelstellen aus dem OData-v4-Service...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Stempelstellen konnten nicht geladen werden</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={filteredStamps}
        keyExtractor={({ stamp }) => stamp.ID}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Keine passenden Stempelstellen</Text>
            <Text style={styles.emptyCopy}>
              Passe Suche oder Filter an, um wieder Ergebnisse aus dem OData-v4-Feed zu sehen.
            </Text>
          </View>
        }
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <StampCard
            distanceKm={item.distanceKm}
            index={index}
            item={item.stamp}
            onPress={() => router.push(`/stamps/${item.stamp.ID}` as never)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            onRefresh={() => loadStamps(true)}
            refreshing={isRefreshing}
            tintColor="#2e6b4b"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f3ee',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 12,
  },
  headerContent: {
    gap: 12,
    marginBottom: 4,
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
    backgroundColor: '#dde9df',
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  cardArtwork: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    color: '#243024',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  cardDescription: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  statePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statePillVisited: {
    backgroundColor: '#e2eee6',
  },
  statePillOpen: {
    backgroundColor: '#f0e9dd',
  },
  statePillLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  statePillLabelVisited: {
    color: '#2e6b4b',
  },
  statePillLabelOpen: {
    color: '#7a6a4a',
  },
  distanceLabel: {
    color: '#6b7a6b',
    fontSize: 11,
    lineHeight: 14,
  },
  cardMark: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '600',
    paddingTop: 2,
  },
  cardChevron: {
    alignSelf: 'center',
  },
  cardMarkVisited: {
    color: '#2e6b4b',
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
});
