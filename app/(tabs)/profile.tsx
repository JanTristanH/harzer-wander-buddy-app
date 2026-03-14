import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchProfileOverview, type ProfileOverviewData } from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';

type ProfileClaims = {
  given_name?: string;
  name?: string;
  nickname?: string;
};

type StampFilter = 'visited' | 'missing' | 'all';

function formatVisitDate(value?: string) {
  if (!value) {
    return 'Unbekanntes Datum';
  }

  const date = new Date(value);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} • ${hh}:${min}`;
}

function mainListCardGradient(index: number, visited: boolean) {
  if (visited) {
    return index % 2 === 0
      ? (['#458962', '#8fd2a4'] as const)
      : (['#4a8464', '#c2dfae'] as const);
  }

  return index % 2 === 0
    ? (['#b6beac', '#e1d2bd'] as const)
    : (['#a6b39c', '#d7cfbb'] as const);
}

function ProfileSection({
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

export default function ProfileScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const claims = useIdTokenClaims<ProfileClaims & { sub?: string }>();
  const [data, setData] = useState<ProfileOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStampFilter, setActiveStampFilter] = useState<StampFilter>('visited');

  const loadProfile = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);

    try {
      const nextData = await fetchProfileOverview(accessToken, claims?.sub);
      setData(nextData);
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
  }, [accessToken, claims?.sub, logout]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const displayName = claims?.name || claims?.nickname || claims?.given_name || 'Wanderbuddy';
  const collectorSinceText = data?.collectorSinceYear
    ? `Stempel-Sammler seit ${data.collectorSinceYear}`
    : 'Stempel-Sammler';

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6b4b" size="large" />
          <Text style={styles.helperText}>Profil wird geladen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Profil konnte nicht geladen werden</Text>
          <Text style={styles.errorBody}>{error || 'Keine Daten verfuegbar.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const filteredStamps = data.stamps.filter((stamp) => {
    if (activeStampFilter === 'visited') {
      return !!stamp.hasVisited;
    }

    if (activeStampFilter === 'missing') {
      return !stamp.hasVisited;
    }

    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.avatarPlaceholder} />
          <View style={styles.headerBody}>
            <Text style={styles.headerName}>{displayName}</Text>
            <Text style={styles.headerMeta}>{collectorSinceText}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/profile/edit' as never)}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
            <Text style={styles.editButtonLabel}>Profil bearbeiten</Text>
          </Pressable>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Besucht</Text>
            <Text style={styles.statValue}>{data.visitedCount}</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Abschluss</Text>
            <Text style={styles.statValue}>{data.completionPercent}%</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Freunde</Text>
            <Text style={styles.statValue}>{data.friendCount}</Text>
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupTitle}>Erfolge & Meilensteine</Text>
          <View style={styles.achievementRow}>
            {data.achievements.map((achievement) => (
              <View key={achievement.id} style={styles.achievementCard}>
                <Text style={styles.achievementLabel}>{achievement.label}</Text>
                <Text style={styles.achievementValue}>{achievement.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <ProfileSection title="Letzte Besuche">
          {data.latestVisits.length > 0 ? (
            data.latestVisits.map((visit) => (
              <Pressable
                key={visit.id}
                disabled={!visit.stampId}
                onPress={() => visit.stampId && router.push(`/stamps/${visit.stampId}` as never)}
                style={({ pressed }) => [styles.rowCard, pressed && visit.stampId && styles.pressed]}>
                <LinearGradient
                  colors={['#4f8b67', '#7fb286'] as const}
                  style={styles.rowArtwork}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>
                    {visit.stampNumber || '--'} {'\u2022'} {visit.stampName}
                  </Text>
                  <Text style={styles.rowSubtitle}>{formatVisitDate(visit.visitedAt)}</Text>
                </View>
                {visit.stampId ? (
                  <Feather color="#2e6b4b" name="chevron-right" size={18} />
                ) : null}
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>Noch keine Besuche vorhanden.</Text>
          )}
        </ProfileSection>

        <ProfileSection title="Freunde">
          {data.featuredFriend ? (
            <View style={styles.rowCard}>
              <View style={styles.friendAvatar} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{data.featuredFriend.name}</Text>
                <Text style={styles.rowSubtitle}>
                  {data.featuredFriend.visitedCount !== null
                    ? `${data.featuredFriend.visitedCount} Stempel`
                    : `${data.friendCount} Freunde verbunden`}
                  {data.featuredFriend.completionPercent !== null
                    ? ` • ${data.featuredFriend.completionPercent}%`
                    : ''}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>Noch keine Freunde verbunden.</Text>
          )}
        </ProfileSection>

        <ProfileSection title="Stempelstellen">
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setActiveStampFilter('visited')}
              style={({ pressed }) => [
                styles.countChip,
                styles.countChipVisited,
                activeStampFilter === 'visited' && styles.countChipActive,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.countChipLabel,
                  styles.countChipLabelVisited,
                  activeStampFilter === 'visited' && styles.countChipLabelActive,
                ]}>
                Besucht: {data.visitedCount}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveStampFilter('missing')}
              style={({ pressed }) => [
                styles.countChip,
                styles.countChipOpen,
                activeStampFilter === 'missing' && styles.countChipActive,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.countChipLabel,
                  activeStampFilter === 'missing' && styles.countChipLabelActive,
                ]}>
                Fehlend: {data.openCount}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveStampFilter('all')}
              style={({ pressed }) => [
                styles.countChip,
                styles.countChipTotal,
                activeStampFilter === 'all' && styles.countChipActive,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.countChipLabel,
                  styles.countChipLabelTotal,
                  activeStampFilter === 'all' && styles.countChipLabelActive,
                ]}>
                Alle: {data.totalCount}
              </Text>
            </Pressable>
          </View>

          {filteredStamps.length > 0 ? (
            filteredStamps.map((stamp, index) => (
              <Pressable
                key={stamp.ID}
                onPress={() => router.push(`/stamps/${stamp.ID}` as never)}
                style={({ pressed }) => [styles.stampCard, pressed && styles.pressed]}>
                <LinearGradient
                  colors={mainListCardGradient(index, !!stamp.hasVisited)}
                  style={styles.stampCardArtwork}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>
                    {stamp.number || '--'} {'\u2022'} {stamp.name}
                  </Text>
                  <Text numberOfLines={2} style={styles.rowSubtitle}>
                    {stamp.description?.trim() || 'Keine Beschreibung verfuegbar.'}
                  </Text>
                  <View style={styles.stampMetaRow}>
                    <View
                      style={[
                        styles.statePill,
                        stamp.hasVisited ? styles.statePillVisited : styles.statePillOpen,
                      ]}>
                      <Feather
                        color={stamp.hasVisited ? '#2e6b4b' : '#7a6a4a'}
                        name={stamp.hasVisited ? 'check' : 'x'}
                        size={11}
                      />
                      <Text
                        style={[
                          styles.statePillLabel,
                          stamp.hasVisited
                            ? styles.statePillLabelVisited
                            : styles.statePillLabelOpen,
                        ]}>
                        {stamp.hasVisited ? 'Besucht' : 'Unbesucht'}
                      </Text>
                    </View>
                  </View>
                </View>
                <Feather color="#8b957f" name="chevron-right" size={18} />
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>Keine Stempelstellen fuer diesen Filter verfuegbar.</Text>
          )}
        </ProfileSection>

        <Pressable onPress={logout} style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}>
          <Text style={styles.logoutLabel}>Ausloggen</Text>
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: '#f5f3ee',
  },
  helperText: {
    color: '#5f6e5f',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#1e2a1e',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    color: '#6b7a6b',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#dde9df',
  },
  headerBody: {
    flex: 1,
    minWidth: 1,
  },
  headerName: {
    color: '#1e2a1e',
    fontSize: 30,
    lineHeight: 38,
    fontFamily: 'serif',
  },
  headerMeta: {
    color: '#788777',
    fontSize: 12,
    lineHeight: 16,
  },
  editButton: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  editButtonLabel: {
    color: '#1e2a1e',
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.84,
  },
  statsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  statBlock: {
    flex: 1,
  },
  statLabel: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  statValue: {
    color: '#1e2a1e',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  achievementRow: {
    flexDirection: 'row',
    gap: 10,
  },
  achievementCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  achievementLabel: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  achievementValue: {
    color: '#1e2a1e',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
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
    elevation: 2,
  },
  sectionTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
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
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
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
  stampCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  stampCardArtwork: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  stampMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statePillVisited: {
    backgroundColor: '#e2eee6',
  },
  statePillOpen: {
    backgroundColor: '#f0e9dd',
  },
  statePillLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  statePillLabelVisited: {
    color: '#2e6b4b',
  },
  statePillLabelOpen: {
    color: '#7a6a4a',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countChip: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  countChipActive: {
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  countChipVisited: {
    backgroundColor: '#e2eee6',
  },
  countChipOpen: {
    backgroundColor: '#caa99b',
  },
  countChipTotal: {
    backgroundColor: '#f0e9dd',
  },
  countChipLabel: {
    color: '#1e2a1e',
    fontSize: 12,
    lineHeight: 16,
  },
  countChipLabelActive: {
    fontWeight: '700',
  },
  countChipLabelVisited: {
    color: '#2e6b4b',
  },
  countChipLabelTotal: {
    color: '#7a6a4a',
  },
  emptyText: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  logoutButton: {
    backgroundColor: '#f0e9dd',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutLabel: {
    color: '#2e3a2e',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
});
