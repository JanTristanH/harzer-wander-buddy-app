import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';

import {
  ProfileErrorState,
  ProfileLoadingState,
  ProfileView,
  type ProfileViewModel,
} from '@/components/profile-view';
import { fetchProfileOverview, type ProfileOverviewData } from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';

type ProfileClaims = {
  given_name?: string;
  name?: string;
  nickname?: string;
};

type StampFilter = 'visited' | 'missing' | 'all';

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

  const viewModel = useMemo<ProfileViewModel | null>(() => {
    if (!data) {
      return null;
    }

    const displayName = claims?.name || claims?.nickname || claims?.given_name || 'Wanderbuddy';
    const collectorSinceText = data.collectorSinceYear
      ? `Stempel-Sammler seit ${data.collectorSinceYear}`
      : 'Stempel-Sammler';

    const filteredStamps = data.stamps.filter((stamp) => {
      if (activeStampFilter === 'visited') {
        return !!stamp.hasVisited;
      }

      if (activeStampFilter === 'missing') {
        return !stamp.hasVisited;
      }

      return true;
    });

    return {
      mode: 'self',
      name: displayName,
      subtitle: collectorSinceText,
      headerAction: {
        type: 'edit',
        label: 'Profil bearbeiten',
        onPress: () => router.push('/profile/edit' as never),
      },
      avatarColor: '#dde9df',
      stats: [
        { label: 'Besucht', value: String(data.visitedCount) },
        { label: 'Abschluss', value: `${data.completionPercent}%` },
        { label: 'Freunde', value: String(data.friendCount) },
      ],
      latestVisits: data.latestVisits,
      latestVisitsEmptyText: 'Noch keine Besuche vorhanden.',
      onVisitPress: (stampId) => router.push(`/stamps/${stampId}` as never),
      friendSummary: data.featuredFriend
        ? {
            name: data.featuredFriend.name,
            image: data.featuredFriend.picture,
            subtitle:
              data.featuredFriend.visitedCount !== null
                ? `${data.featuredFriend.visitedCount} Stempel • ${data.featuredFriend.completionPercent || 0}%`
                : `${data.friendCount} Freunde verbunden`,
            onPress: () => router.push(`/profile/${encodeURIComponent(data.featuredFriend!.id)}` as never),
          }
        : undefined,
      stampChips: [
        { key: 'visited', label: `Besucht: ${data.visitedCount}`, tone: 'success' },
        { key: 'missing', label: `Unbesucht: ${data.openCount}`, tone: 'rose' },
        { key: 'all', label: `Alle: ${data.totalCount}`, tone: 'sand' },
      ],
      activeStampChip: activeStampFilter,
      onSelectStampChip: (key) => setActiveStampFilter(key as StampFilter),
      stampItems: filteredStamps.map((stamp) => ({ kind: 'simple' as const, stamp })),
      onStampPress: (stampId) => router.push(`/stamps/${stampId}` as never),
      emptyStampText: 'Keine Stempelstellen fuer diesen Filter verfuegbar.',
      footerButton: {
        label: 'Ausloggen',
        onPress: () => {
          void logout();
        },
      },
    };
  }, [activeStampFilter, claims?.given_name, claims?.name, claims?.nickname, data, logout, router]);

  if (isLoading) {
    return <ProfileLoadingState label="Profil wird geladen..." />;
  }

  if (error || !viewModel) {
    return (
      <ProfileErrorState
        body={error || 'Keine Daten verfuegbar.'}
        title="Profil konnte nicht geladen werden"
      />
    );
  }

  return <ProfileView data={viewModel} />;
}
