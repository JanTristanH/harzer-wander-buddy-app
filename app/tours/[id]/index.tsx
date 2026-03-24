import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePointsOfInterestQuery, useTourDetailQuery } from '@/lib/queries';

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

export default function TourDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const tourId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data, error, isPending, isFetching } = useTourDetailQuery(tourId);
  const { data: poiData } = usePointsOfInterestQuery();

  const poiNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const poi of poiData ?? []) {
      map.set(poi.ID.toLowerCase(), poi.name);
    }
    return map;
  }, [poiData]);

  const pathRows = useMemo(() => {
    const rows = [...(data?.path ?? [])].sort((left, right) => left.rank - right.rank);
    return rows;
  }, [data?.path]);

  if (!tourId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Tour-ID fehlt</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isPending && !data) {
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

  const tour = data.tour;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
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
          <Text style={styles.title}>{tour.name}</Text>
          <Text style={styles.subtitle}>{`${formatDistance(tour.distance)} • ${formatDuration(tour.duration)} • ${tour.stampCount ?? 0} Stempel`}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tourprofil</Text>
          <Text style={styles.cardLine}>{`Distanz: ${formatDistance(tour.distance)}`}</Text>
          <Text style={styles.cardLine}>{`Dauer: ${formatDuration(tour.duration)}`}</Text>
          <Text style={styles.cardLine}>{`Hoehenprofil: ↑${formatElevation(tour.totalElevationGain)} • ↓${formatElevation(tour.totalElevationLoss)}`}</Text>
          <Text style={styles.cardLine}>{`Stempel: ${tour.stampCount ?? 0}`}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pfad</Text>
          {pathRows.length === 0 ? (
            <Text style={styles.cardLine}>Keine Teilstrecken vorhanden.</Text>
          ) : (
            pathRows.map((row) => {
              const fromPoiId = row.travelTime?.fromPoi || '';
              const toPoiId = row.travelTime?.toPoi || '';
              const fromPoiLabel = poiNameById.get(fromPoiId.toLowerCase()) || fromPoiId || 'Unbekannt';
              const toPoiLabel = poiNameById.get(toPoiId.toLowerCase()) || toPoiId || 'Unbekannt';
              const distanceLabel = row.travelTime?.distanceMeters
                ? formatDistance(row.travelTime.distanceMeters)
                : '-- km';
              const durationLabel = formatDuration(row.travelTime?.durationSeconds ?? null);

              return (
                <View key={`${row.travelTime_ID || 'path'}-${row.rank}`} style={styles.pathRow}>
                  <Text style={styles.pathTitle}>{`${row.rank + 1}. ${fromPoiLabel} -> ${toPoiLabel}`}</Text>
                  <Text style={styles.pathMeta}>{`${distanceLabel} • ${durationLabel}`}</Text>
                </View>
              );
            })
          )}
        </View>

        <Pressable
          onPress={() => router.push(`/tours/${encodeURIComponent(tour.ID)}/edit` as never)}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonLabel}>Tour bearbeiten</Text>
        </Pressable>

        {isFetching ? <Text style={styles.refreshHint}>Aktualisiere Tourdaten im Hintergrund...</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f3ee',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },
  headerWrap: {
    gap: 6,
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
  cardTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  cardLine: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  pathRow: {
    backgroundColor: '#f5f3ee',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  pathTitle: {
    color: '#2e3a2e',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  pathMeta: {
    color: '#6b7a6b',
    fontSize: 11,
    lineHeight: 14,
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
