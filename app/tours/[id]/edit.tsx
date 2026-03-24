import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HttpStatusError } from '@/lib/api';
import {
  usePointsOfInterestQuery,
  useTourDetailQuery,
  useUpdateTourByPOIListMutation,
} from '@/lib/queries';

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

export default function TourEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const tourId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data, error, isPending } = useTourDetailQuery(tourId);
  const { data: pointsOfInterest = [], isPending: isPoiPending } = usePointsOfInterestQuery();
  const updateTourMutation = useUpdateTourByPOIListMutation(tourId);
  const [selectedPoiIds, setSelectedPoiIds] = useState<string[]>([]);
  const [poiSearchQuery, setPoiSearchQuery] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (!data || hasInitialized) {
      return;
    }

    setSelectedPoiIds(derivePoiSequence(data.path));
    setHasInitialized(true);
  }, [data, hasInitialized]);

  const poiById = useMemo(() => {
    const map = new Map<string, (typeof pointsOfInterest)[number]>();
    for (const poi of pointsOfInterest) {
      map.set(poi.ID.toLowerCase(), poi);
    }
    return map;
  }, [pointsOfInterest]);

  const availablePois = useMemo(() => {
    const selectedSet = new Set(selectedPoiIds.map((id) => id.toLowerCase()));
    const normalizedQuery = poiSearchQuery.trim().toLowerCase();

    return pointsOfInterest
      .filter((poi) => !selectedSet.has(poi.ID.toLowerCase()))
      .filter((poi) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          poi.name.toLowerCase().includes(normalizedQuery) ||
          poi.poiType.toLowerCase().includes(normalizedQuery)
        );
      })
      .slice(0, 30);
  }, [pointsOfInterest, poiSearchQuery, selectedPoiIds]);

  const handleSave = async () => {
    if (selectedPoiIds.length < 2) {
      Alert.alert(
        'Zu wenige POIs',
        'Mindestens zwei POIs benoetigt (Start und Ziel), bevor gespeichert werden kann.'
      );
      return;
    }

    try {
      await updateTourMutation.mutateAsync({ poiIds: selectedPoiIds });
      Alert.alert('Tour gespeichert', 'Die Tour wurde aktualisiert.');
      router.replace(`/tours/${encodeURIComponent(tourId || '')}` as never);
    } catch (nextError) {
      if (nextError instanceof HttpStatusError) {
        if (nextError.status === 403) {
          Alert.alert('Bearbeitung gesperrt', 'Diese Tour gehoert nicht zum aktuellen Benutzer.');
          return;
        }

        if (nextError.status === 404) {
          Alert.alert('Tour nicht gefunden', 'Die Tour ist nicht mehr vorhanden.');
          return;
        }

        if (nextError.status === 422) {
          Alert.alert(
            'Route unvollstaendig',
            'Die Route kann mit dieser POI-Reihenfolge nicht vollstaendig berechnet werden. Bitte Reihenfolge anpassen.'
          );
          return;
        }
      }

      Alert.alert(
        'Speichern fehlgeschlagen',
        nextError instanceof Error ? nextError.message : 'Unbekannter Fehler'
      );
    }
  };

  if (!tourId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Tour-ID fehlt</Text>
        </View>
      </SafeAreaView>
    );
  }

  if ((isPending && !data) || isPoiPending) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6b4b" size="large" />
          <Text style={styles.helperText}>Lade Editor...</Text>
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

              router.replace(`/tours/${encodeURIComponent(tourId)}` as never);
            }}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Feather color="#1e2a1e" name="arrow-left" size={16} />
          </Pressable>

          <Text style={styles.title}>Tour bearbeiten</Text>
          <Text style={styles.subtitle}>{data.tour.name}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>POI-Reihenfolge</Text>

          {selectedPoiIds.length === 0 ? (
            <Text style={styles.emptyHint}>Noch keine POIs gesetzt.</Text>
          ) : (
            selectedPoiIds.map((poiId, index) => {
              const poi = poiById.get(poiId.toLowerCase());
              const poiName = poi?.name || poiId;
              const poiType = poi?.poiType || 'unknown';

              return (
                <View key={`${poiId}-${index}`} style={styles.poiRow}>
                  <View style={styles.poiCopyWrap}>
                    <Text style={styles.poiTitle}>{`${index + 1}. ${poiName}`}</Text>
                    <Text style={styles.poiMeta}>{poiType}</Text>
                  </View>

                  <View style={styles.poiActions}>
                    <Pressable
                      disabled={index === 0}
                      onPress={() => {
                        setSelectedPoiIds((current) => {
                          const next = [...current];
                          const temp = next[index - 1];
                          next[index - 1] = next[index];
                          next[index] = temp;
                          return next;
                        });
                      }}
                      style={({ pressed }) => [
                        styles.iconButton,
                        index === 0 && styles.iconButtonDisabled,
                        pressed && index !== 0 && styles.pressed,
                      ]}>
                      <Feather color={index === 0 ? '#9ba59a' : '#2e3a2e'} name="arrow-up" size={14} />
                    </Pressable>

                    <Pressable
                      disabled={index === selectedPoiIds.length - 1}
                      onPress={() => {
                        setSelectedPoiIds((current) => {
                          const next = [...current];
                          const temp = next[index + 1];
                          next[index + 1] = next[index];
                          next[index] = temp;
                          return next;
                        });
                      }}
                      style={({ pressed }) => [
                        styles.iconButton,
                        index === selectedPoiIds.length - 1 && styles.iconButtonDisabled,
                        pressed && index !== selectedPoiIds.length - 1 && styles.pressed,
                      ]}>
                      <Feather
                        color={index === selectedPoiIds.length - 1 ? '#9ba59a' : '#2e3a2e'}
                        name="arrow-down"
                        size={14}
                      />
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setSelectedPoiIds((current) => current.filter((_, currentIndex) => currentIndex !== index));
                      }}
                      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                      <Feather color="#a34e4e" name="trash-2" size={14} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>POI hinzufuegen</Text>
          <View style={styles.searchShell}>
            <Feather color="#6d7d6e" name="search" size={14} />
            <TextInput
              onChangeText={setPoiSearchQuery}
              placeholder="Name oder Typ suchen"
              placeholderTextColor="#7b8776"
              style={styles.searchInput}
              value={poiSearchQuery}
            />
          </View>

          {availablePois.length === 0 ? (
            <Text style={styles.emptyHint}>Keine weiteren passenden POIs.</Text>
          ) : (
            availablePois.map((poi) => (
              <Pressable
                key={poi.ID}
                onPress={() => setSelectedPoiIds((current) => [...current, poi.ID])}
                style={({ pressed }) => [styles.addPoiRow, pressed && styles.pressed]}>
                <View style={styles.poiCopyWrap}>
                  <Text style={styles.poiTitle}>{poi.name}</Text>
                  <Text style={styles.poiMeta}>{poi.poiType}</Text>
                </View>
                <Feather color="#2e6b4b" name="plus-circle" size={16} />
              </Pressable>
            ))
          )}
        </View>

        <Pressable
          disabled={updateTourMutation.isPending}
          onPress={handleSave}
          style={({ pressed }) => [
            styles.primaryButton,
            updateTourMutation.isPending && styles.primaryButtonDisabled,
            pressed && !updateTourMutation.isPending && styles.pressed,
          ]}>
          <Text style={styles.primaryButtonLabel}>
            {updateTourMutation.isPending ? 'Speichere...' : 'Speichern'}
          </Text>
        </Pressable>
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
    gap: 8,
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
  poiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#f5f3ee',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addPoiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#eef5ef',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  poiCopyWrap: {
    flex: 1,
    minWidth: 1,
  },
  poiTitle: {
    color: '#2e3a2e',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  poiMeta: {
    color: '#6b7a6b',
    fontSize: 11,
    lineHeight: 14,
  },
  poiActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f3ee',
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    color: '#2e3a2e',
    fontSize: 13,
    lineHeight: 16,
    paddingVertical: 0,
  },
  emptyHint: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
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
