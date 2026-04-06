import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileErrorState, ProfileLoadingState } from '@/components/profile-view';
import { useAuth, useIdTokenClaims } from '@/lib/auth';
import { buildAuthenticatedImageSource } from '@/lib/images';
import { groupTimelineEntriesByDay, trimTimelineEntries } from '@/lib/profile-timeline';
import { useProfileOverviewQuery, useUserProfileOverviewQuery } from '@/lib/queries';

type TimelineClaims = {
  sub?: string;
};

function formatVisitDate(value?: string) {
  if (!value) {
    return 'Unbekanntes Datum';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unbekanntes Datum';
  }

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} • ${hh}:${min}`;
}

export default function ProfileTimelineScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userIdParam = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const requestedUserId = userIdParam ? decodeURIComponent(userIdParam) : '';
  const claims = useIdTokenClaims<TimelineClaims>();
  const { accessToken } = useAuth();
  const isSelf = requestedUserId === 'self' || (Boolean(claims?.sub) && requestedUserId === claims?.sub);
  const selfProfileQuery = useProfileOverviewQuery();
  const userProfileQuery = useUserProfileOverviewQuery(
    !isSelf && requestedUserId ? requestedUserId : undefined
  );

  const activeData = isSelf ? selfProfileQuery.data : userProfileQuery.data;
  const isPending = isSelf ? selfProfileQuery.isPending : userProfileQuery.isPending;
  const isFetching = isSelf ? selfProfileQuery.isFetching : userProfileQuery.isFetching;
  const activeError = isSelf ? selfProfileQuery.error : userProfileQuery.error;
  const refetch = isSelf ? selfProfileQuery.refetch : userProfileQuery.refetch;
  const profileName = activeData?.name || 'Profil';
  const timelineEntries = useMemo(
    () => trimTimelineEntries(activeData?.stampings ?? []),
    [activeData?.stampings]
  );
  const groupedTimeline = useMemo(
    () => groupTimelineEntriesByDay(timelineEntries),
    [timelineEntries]
  );

  if (!requestedUserId) {
    return (
      <ProfileErrorState
        body="Keine Benutzer-ID uebergeben."
        title="Timeline konnte nicht geladen werden"
      />
    );
  }

  if (isPending && !activeData) {
    return <ProfileLoadingState label="Timeline wird geladen..." />;
  }

  if (!activeData) {
    return (
      <ProfileErrorState
        body={activeError?.message || 'Keine Daten verfuegbar.'}
        title="Timeline konnte nicht geladen werden"
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              void refetch();
            }}
            refreshing={isFetching && !isPending}
            tintColor="#2e6b4b"
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Feather color="#1e2a1e" name="arrow-left" size={16} />
          </Pressable>
          <View style={styles.headerBody}>
            <Text style={styles.title}>Timeline</Text>
            <Text style={styles.subtitle}>{profileName} • Alle Besuche (max. 250)</Text>
          </View>
        </View>

        {groupedTimeline.length > 0 ? (
          groupedTimeline.map((group) => (
            <View key={group.dayKey} style={styles.daySection}>
              <Text style={styles.dayLabel}>{group.title}</Text>
              {group.items.map((visit) => {
                const disabled = !visit.stampId;
                return (
                  <Pressable
                    key={visit.id}
                    disabled={disabled}
                    onPress={() => {
                      if (visit.stampId) {
                        router.push(`/stamps/${visit.stampId}` as never);
                      }
                    }}
                    style={({ pressed }) => [styles.rowCard, pressed && !disabled && styles.pressed]}>
                    {visit.heroImageUrl ? (
                      <Image
                        cachePolicy="disk"
                        contentFit="cover"
                        source={buildAuthenticatedImageSource(visit.heroImageUrl, accessToken)}
                        style={styles.rowArtwork}
                      />
                    ) : (
                      <View style={styles.rowArtworkFallback} />
                    )}
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>
                        {visit.stampNumber || '--'} {'\u2022'} {visit.stampName}
                      </Text>
                      <Text style={styles.rowSubtitle}>{formatVisitDate(visit.visitedAt)}</Text>
                    </View>
                    {!disabled ? <Feather color="#2e6b4b" name="chevron-right" size={18} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Noch keine Besuche in der Timeline.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f2efe8',
  },
  content: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0e9dd',
  },
  headerBody: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#1e2a1e',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#4d6d56',
    fontSize: 12,
    lineHeight: 16,
  },
  daySection: {
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
  dayLabel: {
    color: '#4d6d56',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8f6f1',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  rowArtwork: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  rowArtworkFallback: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#dde9df',
  },
  rowBody: {
    flex: 1,
    minWidth: 1,
  },
  rowTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  rowSubtitle: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyText: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.84,
  },
});
