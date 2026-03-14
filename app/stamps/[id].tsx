import { Feather } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthGuard } from '@/components/auth-guard';
import { createStamping, fetchStampDetail, type StampDetailData } from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';

type IdClaims = {
  sub?: string;
};

function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) {
    return 'Keine Distanz';
  }

  return `${distanceKm.toFixed(1).replace('.', ',')} km`;
}

function formatDuration(durationMinutes: number | null) {
  if (durationMinutes === null) {
    return '';
  }

  return `${durationMinutes} Min`;
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

function heroGradient(visited: boolean) {
  return visited
    ? (['#4f8b67', '#79af82', '#d8c88f'] as const)
    : (['#b8bdb1', '#cfd3c8', '#e1d7c5'] as const);
}

function Section({
  title,
  children,
}: React.PropsWithChildren<{
  title: string;
}>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StampDetailContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { accessToken, logout } = useAuth();
  const claims = useIdTokenClaims<IdClaims>();
  const stampId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [detail, setDetail] = useState<StampDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStamping, setIsStamping] = useState(false);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)' as never);
  }

  const loadDetail = useCallback(async () => {
    if (!accessToken || !stampId) {
      return;
    }

    setIsLoading(true);

    try {
      const nextDetail = await fetchStampDetail(accessToken, stampId, claims?.sub);
      setDetail(nextDetail);
      setError(null);
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
        await logout();
        return;
      }

      setError(nextError instanceof Error ? nextError.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, claims?.sub, logout, stampId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function handleShare() {
    if (!detail) {
      return;
    }

    const deepLink = ExpoLinking.createURL(`/stamps/${detail.stamp.ID}`);

    await Share.share({
      message: `Stempel ${detail.stamp.number || '--'} • ${detail.stamp.name}\n${deepLink}`,
      url: deepLink,
      title: `Stempel ${detail.stamp.number || '--'} • ${detail.stamp.name}`,
    });
  }

  async function handleStartNavigation() {
    if (!detail?.stamp.latitude || !detail?.stamp.longitude) {
      Alert.alert('Navigation nicht moeglich', 'Diese Stempelstelle hat keine Koordinaten.');
      return;
    }

    const url = `https://www.google.com/maps/search/?api=1&query=${detail.stamp.latitude},${detail.stamp.longitude}`;
    await Linking.openURL(url);
  }

  async function handleStampVisit() {
    if (!accessToken || !stampId || isStamping) {
      return;
    }

    setIsStamping(true);

    try {
      await createStamping(accessToken, stampId);
      await loadDetail();
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
  }

  if (!stampId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Ungültige Stempelstelle</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6b4b" size="large" />
          <Text style={styles.helperText}>Lade Details aus dem OData-v4-Service...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Details konnten nicht geladen werden</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Keine Detaildaten gefunden</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { stamp } = detail;
  const visited = !!stamp.hasVisited;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <LinearGradient colors={heroGradient(visited)} style={styles.hero}>
          <Pressable onPress={handleBack} style={({ pressed }) => [styles.topButton, pressed && styles.topButtonPressed]}>
            <Feather color="#1e2a1e" name="arrow-left" size={18} />
          </Pressable>

          <View style={styles.topRightActions}>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillLabel}>{visited ? 'Besucht' : 'Unbesucht'}</Text>
            </View>
            <Pressable onPress={handleShare} style={({ pressed }) => [styles.topButton, pressed && styles.topButtonPressed]}>
              <Feather color="#1e2a1e" name="share-2" size={18} />
            </Pressable>
          </View>

          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Stempel {stamp.number || '--'}</Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <Text style={styles.title}>{stamp.name}</Text>
          <Text style={styles.description}>
            {stamp.description?.trim() || 'Keine Beschreibung fuer diese Stempelstelle verfuegbar.'}
          </Text>

          <Section title="Stempel in der Naehe">
            {detail.nearbyStamps.length > 0 ? (
              detail.nearbyStamps.map((neighbor) => (
                <Pressable
                  key={neighbor.ID}
                  onPress={() => router.push(`/stamps/${neighbor.ID}` as never)}
                  style={({ pressed }) => [styles.rowItem, pressed && styles.rowItemPressed]}>
                  <View style={[styles.rowBadge, styles.rowBadgeStamp]}>
                    <Text style={[styles.rowBadgeLabel, styles.rowBadgeLabelStamp]}>S</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>
                      Stempel {neighbor.number || '--'} {'\u2022'} {neighbor.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatDistance(neighbor.distanceKm)}
                      {neighbor.durationMinutes ? ` • ${formatDuration(neighbor.durationMinutes)}` : ''}
                    </Text>
                  </View>
                  <Feather color="#8b957f" name="chevron-right" size={18} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptySectionText}>Keine benachbarten Stempelstellen gefunden.</Text>
            )}
          </Section>

          <Section title="Parkplaetze in der Naehe">
            {detail.nearbyParking.length > 0 ? (
              detail.nearbyParking.map((parking) => (
                <View key={parking.ID} style={styles.simpleItem}>
                  <Text style={styles.simpleItemTitle}>
                    {parking.name} ({formatDistance(parking.distanceKm)}
                    {parking.durationMinutes ? ` • ${formatDuration(parking.durationMinutes)}` : ''})
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptySectionText}>Keine Parkplaetze in der Naehe gefunden.</Text>
            )}
          </Section>

          <Section title="Freunde hier gewesen">
            {detail.friendVisits.length > 0 ? (
              detail.friendVisits.map((visit, index) => (
                <View key={visit.id} style={styles.friendRow}>
                  <View style={[styles.avatarDot, index % 2 === 0 ? styles.avatarDotGreen : styles.avatarDotSand]} />
                  <Text style={styles.friendRowText}>
                    {visit.name} {'\u2022'} {formatVisitDate(visit.createdAt)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptySectionText}>Noch keine Freundesbesuche fuer diese Stelle.</Text>
            )}
          </Section>

          <Section title="Meine bisherigen Besuche">
            {detail.myVisits.length > 0 ? (
              detail.myVisits.map((visit) => (
                <View key={visit.ID} style={styles.simpleItem}>
                  <Text style={styles.simpleItemTitle}>{formatVisitDate(visit.createdAt)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptySectionText}>Du hast diese Stempelstelle noch nicht gestempelt.</Text>
            )}
          </Section>
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={styles.bottomDock}>
        <View style={styles.bottomActions}>
          <Pressable onPress={handleStartNavigation} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
            <Text style={styles.secondaryButtonLabel}>Navigation starten</Text>
          </Pressable>
          <Pressable
            disabled={visited || isStamping}
            onPress={handleStampVisit}
            style={({ pressed }) => [
              styles.primaryButton,
              (visited || isStamping) && styles.primaryButtonDisabled,
              pressed && !visited && !isStamping && styles.primaryButtonPressed,
            ]}>
            <Text style={styles.primaryButtonLabel}>
              {visited ? 'Bereits gestempelt' : isStamping ? 'Stemple...' : 'Besuch stempeln'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function StampDetailScreen() {
  return (
    <AuthGuard>
      <StampDetailContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f3ee',
  },
  scrollContent: {
    paddingBottom: 180,
  },
  hero: {
    height: 240,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(240,233,221,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topButtonPressed: {
    opacity: 0.88,
  },
  topRightActions: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  statusPill: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillLabel: {
    color: '#1e2a1e',
    fontSize: 12,
    lineHeight: 16,
  },
  heroBadge: {
    position: 'absolute',
    left: 20,
    bottom: 16,
    backgroundColor: '#f5f3ee',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: {
    color: '#1e2a1e',
    fontSize: 12,
    lineHeight: 16,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  title: {
    color: '#1e2a1e',
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'serif',
  },
  description: {
    color: '#445244',
    fontSize: 14,
    lineHeight: 22,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  sectionTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowItemPressed: {
    opacity: 0.85,
  },
  rowBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBadgeStamp: {
    backgroundColor: '#e2eee6',
  },
  rowBadgeLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowBadgeLabelStamp: {
    color: '#2e6b4b',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: '#111111',
    fontSize: 13,
    lineHeight: 16,
  },
  rowMeta: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  simpleItem: {
    gap: 2,
  },
  simpleItemTitle: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
  },
  avatarDotGreen: {
    backgroundColor: '#dde9df',
  },
  avatarDotSand: {
    backgroundColor: '#eadfcb',
  },
  friendRowText: {
    color: '#1e2a1e',
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  emptySectionText: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  bottomDock: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
  },
  bottomActions: {
    gap: 8,
  },
  secondaryButton: {
    height: 45,
    borderRadius: 14,
    backgroundColor: '#e9e2d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.9,
  },
  secondaryButtonLabel: {
    color: '#2e3a2e',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  primaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#2e6b4b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#7aa287',
  },
  primaryButtonPressed: {
    opacity: 0.92,
  },
  primaryButtonLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
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
});
