import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Share,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthGuard } from '@/components/auth-guard';
import { SkeletonBlock } from '@/components/skeleton';
import { useAuth } from '@/lib/auth';
import { buildAuthenticatedImageSource } from '@/lib/images';
import { useParkingDetailQuery } from '@/lib/queries';

const WEBSITE_BASE_URL = 'https://www.harzer-wander-buddy.de';
const emptyNearbyStampsIllustration = require('@/assets/images/buddy/telescope.png');

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

function formatElevationSummary(elevationGainMeters: number | null, elevationLossMeters: number | null) {
  const parts: string[] = [];

  if (typeof elevationGainMeters === 'number' && Number.isFinite(elevationGainMeters)) {
    parts.push(`↑${Math.round(Math.abs(elevationGainMeters))} m`);
  }

  if (typeof elevationLossMeters === 'number' && Number.isFinite(elevationLossMeters)) {
    parts.push(`↓${Math.round(Math.abs(elevationLossMeters))} m`);
  }

  return parts.length > 0 ? ` • ${parts.join(' ')}` : '';
}

function SkeletonLine({
  width,
  height = 14,
}: {
  width: number | `${number}%`;
  height?: number;
}) {
  return <SkeletonBlock height={height} radius={999} width={width} />;
}

function SkeletonRow() {
  return (
    <View style={styles.skeletonRow}>
      <View style={styles.skeletonBadge} />
      <View style={styles.skeletonColumn}>
        <SkeletonLine width="68%" />
        <SkeletonLine height={12} width="44%" />
      </View>
    </View>
  );
}

function Section({
  title,
  children,
}: React.PropsWithChildren<{
  title: string;
}>) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ParkingDetailLoadingState({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.loadingContent} showsVerticalScrollIndicator={false}>
        <View style={styles.loadingHero}>
          <Pressable onPress={onBack} style={({ pressed }) => [styles.topButton, pressed && styles.topButtonPressed]}>
            <Feather color="#1e2a1e" name="arrow-left" size={18} />
          </Pressable>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Parkplatz</Text>
          </View>
        </View>

        <View style={styles.body}>
          <SkeletonBlock height={34} radius={12} tone="strong" width="58%" />
          <View style={styles.descriptionSkeleton}>
            <SkeletonLine width="100%" />
            <SkeletonLine width="82%" />
            <SkeletonLine width="56%" />
          </View>

          <Section title="Stempel in der Nähe">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </Section>

          <Section title="Parkplätze in der Nähe">
            <SkeletonRow />
            <SkeletonRow />
          </Section>
        </View>

        <Text style={styles.helperText}>Lade Parkplatz-Details...</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ParkingDetailContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string | string[];
    disableNavigation?: string | string[];
  }>();
  const { accessToken } = useAuth();
  const parkingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const disableNavigationParam = Array.isArray(params.disableNavigation)
    ? params.disableNavigation[0]
    : params.disableNavigation;
  const isNavigationDisabled =
    disableNavigationParam === '1' || disableNavigationParam === 'true';
  const { data: detail, error, isFetching, isPending, isPlaceholderData, refetch } =
    useParkingDetailQuery(parkingId);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/map' as never);
  }

  async function handleStartNavigation() {
    if (!detail?.parking.latitude || !detail?.parking.longitude) {
      Alert.alert('Navigation nicht moeglich', 'Dieser Parkplatz hat keine Koordinaten.');
      return;
    }

    const url = `https://www.google.com/maps/search/?api=1&query=${detail.parking.latitude},${detail.parking.longitude}`;
    await Linking.openURL(url);
  }

  function handleShowOnMap() {
    if (!detail?.parking.ID) {
      return;
    }

    router.push({
      pathname: '/(tabs)/map',
      params: { parkingId: detail.parking.ID },
    } as never);
  }

  async function handleShareParking() {
    if (!detail?.parking.ID) {
      return;
    }

    const shareParams = new URLSearchParams({
      id: detail.parking.ID,
      title: detail.parking.name?.trim() || 'Parkplatz',
      description: detail.parking.description?.trim() || 'Parkplatz im Harz teilen.',
      image: detail.parking.image?.trim() || '',
    });
    const shareUrl = `${WEBSITE_BASE_URL}/share/parking/?${shareParams.toString()}`;

    try {
      await Share.share({
        message: `${detail.parking.name?.trim() || 'Parkplatz'}\n${shareUrl}`,
        title: detail.parking.name?.trim() || 'Parkplatz',
        url: shareUrl,
      });
    } catch (nextError) {
      Alert.alert(
        'Teilen nicht moeglich',
        nextError instanceof Error ? nextError.message : 'Unknown error'
      );
    }
  }

  if (isPending && !detail) {
    return <ParkingDetailLoadingState onBack={handleBack} />;
  }

  if (error && !detail) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Details konnten nicht geladen werden</Text>
          <Text style={styles.helperText}>{error.message}</Text>
          <Pressable
            onPress={() => void refetch()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}>
            <Text style={styles.retryButtonLabel}>Erneut versuchen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Keine Detaildaten gefunden</Text>
          <Text style={styles.helperText}>Fuer diesen Parkplatz liegen aktuell keine Daten vor.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { parking } = detail;
  const heroImageUri = parking.image?.trim();
  const showDeferredSkeletons = isFetching && isPlaceholderData;
  const isPullRefreshing = isFetching && !isPending;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              void refetch();
            }}
            refreshing={isPullRefreshing}
            tintColor="#2f7dd7"
          />
        }
        showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#4e88cc', '#78b2e8', '#ddeaf7']} style={styles.hero}>
          {heroImageUri ? (
            <>
              <Image
                cachePolicy="disk"
                contentFit="cover"
                source={buildAuthenticatedImageSource(heroImageUri, accessToken)}
                style={styles.heroImage}
              />
              <View style={styles.heroImageOverlay} />
            </>
          ) : null}

          <Pressable onPress={handleBack} style={({ pressed }) => [styles.topButton, pressed && styles.topButtonPressed]}>
            <Feather color="#1e2a1e" name="arrow-left" size={18} />
          </Pressable>

          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Parkplatz</Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <Text style={styles.title}>{parking.name?.trim() || 'Parkplatz'}</Text>
          {parking.description?.trim() ? (
            <Text style={styles.description}>{parking.description.trim()}</Text>
          ) : showDeferredSkeletons ? (
            <View style={styles.descriptionSkeleton}>
              <SkeletonLine width="100%" />
              <SkeletonLine width="82%" />
              <SkeletonLine width="56%" />
            </View>
          ) : (
            <Text style={styles.description}>Keine Beschreibung fuer diesen Parkplatz verfuegbar.</Text>
          )}

          <Section title="Stempel in der Nähe">
            {showDeferredSkeletons ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : detail.nearbyStamps.length > 0 ? (
              detail.nearbyStamps.map((neighbor) => (
                <Pressable
                  disabled={isNavigationDisabled}
                  key={neighbor.ID}
                  onPress={
                    isNavigationDisabled ? undefined : () => router.push(`/stamps/${neighbor.ID}` as never)
                  }
                  style={({ pressed }) => [
                    styles.rowItem,
                    pressed && !isNavigationDisabled && styles.rowItemPressed,
                  ]}>
                  {neighbor.heroImageUrl ? (
                    <Image
                      cachePolicy="disk"
                      contentFit="cover"
                      source={buildAuthenticatedImageSource(neighbor.heroImageUrl, accessToken)}
                      style={styles.rowArtwork}
                    />
                  ) : (
                    <View style={[styles.rowBadge, styles.rowBadgeStamp]}>
                      <Text style={[styles.rowBadgeLabel, styles.rowBadgeLabelStamp]}>
                        {neighbor.number || '--'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>
                      {neighbor.number || '--'} {'\u2022'} {neighbor.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatDistance(neighbor.distanceKm)}
                      {neighbor.durationMinutes ? ` • ${formatDuration(neighbor.durationMinutes)}` : ''}
                      {formatElevationSummary(neighbor.elevationGainMeters, neighbor.elevationLossMeters)}
                    </Text>
                  </View>
                  {!isNavigationDisabled ? (
                    <Feather color="#8b957f" name="chevron-right" size={18} />
                  ) : null}
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyNearbyStampsState}>
                <Image
                  contentFit="contain"
                  source={emptyNearbyStampsIllustration}
                  style={styles.emptyNearbyStampsIllustration}
                />
                <Text style={[styles.emptySectionText, styles.emptyNearbyStampsText]}>
                  Keine Stempel in der Nähe gefunden.
                </Text>
              </View>
            )}
          </Section>

          <Section title="Parkplätze in der Nähe">
            {showDeferredSkeletons ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : detail.nearbyParking.length > 0 ? (
              detail.nearbyParking.map((nearbyParking) => (
                <Pressable
                  disabled={isNavigationDisabled}
                  key={nearbyParking.ID}
                  onPress={
                    isNavigationDisabled
                      ? undefined
                      : () => router.push(`/parking/${nearbyParking.ID}` as never)
                  }
                  style={({ pressed }) => [
                    styles.rowItem,
                    pressed && !isNavigationDisabled && styles.rowItemPressed,
                  ]}>
                  <View style={[styles.rowBadge, styles.rowBadgeParking]}>
                    <Text style={[styles.rowBadgeLabel, styles.rowBadgeLabelParking]}>P</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{nearbyParking.name}</Text>
                    <Text style={styles.rowMeta}>
                      {formatDistance(nearbyParking.distanceKm)}
                      {nearbyParking.durationMinutes ? ` • ${formatDuration(nearbyParking.durationMinutes)}` : ''}
                      {formatElevationSummary(
                        nearbyParking.elevationGainMeters,
                        nearbyParking.elevationLossMeters
                      )}
                    </Text>
                  </View>
                  {!isNavigationDisabled ? (
                    <Feather color="#8b957f" name="chevron-right" size={18} />
                  ) : null}
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptySectionText}>Keine Parkplätze in der Nähe gefunden.</Text>
            )}
          </Section>
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={styles.bottomDock}>
        <View style={styles.bottomActions}>
          <View style={styles.secondaryButtonRow}>
            <Pressable
              onPress={handleStartNavigation}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.secondaryButtonHalf,
                styles.secondaryButtonWithIcon,
                pressed && styles.secondaryButtonPressed,
              ]}>
              <Feather color="#2e3a2e" name="navigation" size={16} />
              <Text style={styles.secondaryButtonLabel}>Navigation starten</Text>
            </Pressable>
            {!isNavigationDisabled ? (
              <Pressable
                onPress={handleShowOnMap}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.secondaryButtonHalf,
                  styles.secondaryButtonWithIcon,
                  pressed && styles.secondaryButtonPressed,
                ]}>
                <Feather color="#2e3a2e" name="map-pin" size={16} />
                <Text style={styles.secondaryButtonLabel}>Auf Karte anzeigen</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => void handleShareParking()}
            style={({ pressed }) => [
              styles.secondaryButton,
              styles.secondaryButtonWithIcon,
              pressed && styles.secondaryButtonPressed,
            ]}>
            <Feather color="#2e3a2e" name="share-2" size={16} />
            <Text style={styles.secondaryButtonLabel}>Parkplatz teilen</Text>
          </Pressable>
          {isNavigationDisabled ? (
            <Text style={styles.navigationDisabledHint}>
              Verlinkungen zu anderen Stempeln und Parkplaetzen sind hier deaktiviert.
            </Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function ParkingDetailScreen() {
  return (
    <AuthGuard>
      <ParkingDetailContent />
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
  loadingContent: {
    paddingBottom: 40,
  },
  loadingHero: {
    height: 240,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#cad6e3',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  helperText: {
    color: '#6b7a6b',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#1e2a1e',
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '700',
  },
  retryButton: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: '#2e6b4b',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  retryButtonPressed: {
    opacity: 0.85,
  },
  retryButtonLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
  hero: {
    height: 240,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22, 28, 22, 0.22)',
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
  descriptionSkeleton: {
    gap: 8,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
  rowArtwork: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  rowBadgeStamp: {
    backgroundColor: '#e2eee6',
  },
  rowBadgeParking: {
    backgroundColor: '#e3effc',
  },
  rowBadgeLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowBadgeLabelStamp: {
    color: '#2e6b4b',
  },
  rowBadgeLabelParking: {
    color: '#2f7dd7',
    fontWeight: '700',
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
  emptySectionText: {
    color: '#6b7a6b',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyNearbyStampsState: {
    alignItems: 'center',
    gap: 8,
  },
  emptyNearbyStampsIllustration: {
    width: 120,
    height: 120,
  },
  emptyNearbyStampsText: {
    textAlign: 'center',
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skeletonBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ece6db',
  },
  skeletonColumn: {
    flex: 1,
    gap: 8,
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
  secondaryButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    height: 45,
    borderRadius: 14,
    backgroundColor: '#e9e2d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonHalf: {
    flex: 1,
  },
  secondaryButtonWithIcon: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
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
  navigationDisabledHint: {
    color: '#7c8779',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
});
