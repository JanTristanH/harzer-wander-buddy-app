import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';

import {
  ProfileErrorState,
  ProfileLoadingState,
  ProfileView,
  type ProfileViewModel,
} from '@/components/profile-view';
import { useAuth, useIdTokenClaims } from '@/lib/auth';
import { useProfileOverviewQuery } from '@/lib/queries';

type StampFilter = 'visited' | 'missing' | 'all';
type ProfileClaims = {
  sub?: string;
  name?: string;
  picture?: string;
};

const emptyVisitedIllustration = require('@/assets/images/buddy/emptyNotebook.png');

export default function ProfileScreen() {
  const router = useRouter();
  const { currentUserProfile, logout, resetApp } = useAuth();
  const claims = useIdTokenClaims<ProfileClaims & { sub?: string }>();
  const [activeStampFilter, setActiveStampFilter] = useState<StampFilter>('visited');
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const { data, error, isFetching, isPending, isPlaceholderData, refetch } = useProfileOverviewQuery();
  const blockingError = !data ? error : null;

  const viewModel = useMemo<ProfileViewModel | null>(() => {
    if (!data) {
      return null;
    }

    const collectorSinceText = data.collectorSinceYear
      ? `Stempel-Sammler seit ${data.collectorSinceYear}`
      : 'Stempel-Sammler';
    const profileName = data.name || currentUserProfile?.name || claims?.name || claims?.sub || 'Profil';
    const profilePicture = data.picture || currentUserProfile?.picture || claims?.picture;

    const filteredStamps = data.stamps.filter((stamp) => {
      if (activeStampFilter === 'visited') {
        return !!stamp.hasVisited;
      }

      if (activeStampFilter === 'missing') {
        return !stamp.hasVisited;
      }

      return true;
    });
    const isVisitedEmptyState = activeStampFilter === 'visited' && data.visitedCount === 0;

    return {
      mode: 'self',
      name: profileName,
      subtitle: collectorSinceText,
      headerAction: {
        type: 'edit',
        label: 'Profil bearbeiten',
        onPress: () => router.push('/profile/edit' as never),
      },
      avatarColor: '#dde9df',
      avatarImage: profilePicture,
      stats: [
        { label: 'Besucht', value: String(data.visitedCount) },
        { label: 'Abschluss', value: `${data.completionPercent}%` },
        { label: 'Freunde', value: String(data.friendCount) },
      ],
      latestVisits: data.latestVisits,
      latestVisitsEmptyText: 'Noch keine Besuche.',
      onVisitPress: (stampId) => router.push(`/stamps/${stampId}` as never),
      friendsList: {
        items: data.friends.map((friend) => ({
          id: friend.id,
          name: friend.name,
          image: friend.picture,
          subtitle: `${friend.visitedCount} Stempel • ${friend.completionPercent}%`,
          onPress: () => router.push(`/profile/${encodeURIComponent(friend.id)}` as never),
        })),
        emptyText: 'Noch keine Freunde.',
      },
      stampChips: [
        { key: 'visited', label: `Besucht: ${data.visitedCount}`, tone: 'success' },
        { key: 'missing', label: `Unbesucht: ${data.openCount}`, tone: 'rose' },
        { key: 'all', label: `Alle: ${data.totalCount}`, tone: 'sand' },
      ],
      activeStampChip: activeStampFilter,
      onSelectStampChip: (key) => setActiveStampFilter(key as StampFilter),
      stampItems: filteredStamps.map((stamp) => ({ kind: 'simple' as const, stamp })),
      onStampPress: (stampId) => router.push(`/stamps/${stampId}` as never),
      emptyStampText: isVisitedEmptyState
        ? 'Sobald du deine erste Stempelstelle besuchst, erscheint sie hier.'
        : 'Hier gibt es gerade keine passenden Stempelstellen.',
      emptyStampIllustration: isVisitedEmptyState ? emptyVisitedIllustration : undefined,
      onRefresh: () => {
        void (async () => {
          setIsPullRefreshing(true);
          try {
            await refetch();
          } finally {
            setIsPullRefreshing(false);
          }
        })();
      },
      refreshing: isPullRefreshing,
      refreshHint: isFetching && !isPending ? 'Aktualisiere Daten im Hintergrund...' : undefined,
      showDeferredSkeletons: isPlaceholderData,
      footerButtons: [
        {
          key: 'reset-app',
          label: 'Onboarding neu starten',
          onPress: () => {
            void resetApp();
          },
        },
        {
          key: 'logout',
          label: 'Ausloggen',
          onPress: () => {
            void logout();
          },
        },
      ],
    };
  }, [
    activeStampFilter,
    claims?.name,
    claims?.picture,
    claims?.sub,
    currentUserProfile?.name,
    currentUserProfile?.picture,
    data,
    isFetching,
    isPending,
    isPlaceholderData,
    isPullRefreshing,
    logout,
    refetch,
    resetApp,
    router,
  ]);

  if (isPending && !data) {
    return <ProfileLoadingState label="Profil wird geladen..." />;
  }

  if (blockingError || !viewModel) {
    return (
      <ProfileErrorState
        body={blockingError?.message || 'Keine Daten verfuegbar.'}
        title="Profil konnte nicht geladen werden"
      />
    );
  }

  return <ProfileView data={viewModel} />;
}
