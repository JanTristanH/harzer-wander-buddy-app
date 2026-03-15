import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import {
  ProfileErrorState,
  ProfileLoadingState,
  ProfileView,
  type ProfileViewModel,
} from '@/components/profile-view';
import {
  acceptPendingFriendshipRequest,
  createFriendRequest,
  fetchUserProfileOverview,
  removeFriendship,
  updateFriendshipPermission,
  type UserProfileOverviewData,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

type ComparisonFilter = 'shared' | 'friendOnly' | 'meOnly' | 'neither';

export default function FriendProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userIdParam = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const userId = userIdParam ? decodeURIComponent(userIdParam) : '';
  const { accessToken, logout } = useAuth();
  const [data, setData] = useState<UserProfileOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ComparisonFilter>('shared');
  const [isMutating, setIsMutating] = useState(false);

  const loadProfile = useCallback(async (refresh = false) => {
    if (!accessToken || !userId) {
      return;
    }

    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const nextData = await fetchUserProfileOverview(accessToken, userId);

      if (nextData.relationship === 'self') {
        router.replace('/(tabs)/profile' as never);
        return;
      }

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
      setIsRefreshing(false);
    }
  }, [accessToken, logout, router, userId]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const handleMutationError = useCallback(
    async (nextError: unknown, title: string) => {
      if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
        await logout();
        return;
      }

      Alert.alert(title, nextError instanceof Error ? nextError.message : 'Unknown error');
    },
    [logout]
  );

  const viewModel = useMemo<ProfileViewModel | null>(() => {
    if (!data) {
      return null;
    }

    const filteredStamps = data.stampComparisons.filter((item) => {
      if (activeFilter === 'shared') {
        return item.meVisited && item.userVisited;
      }

      if (activeFilter === 'friendOnly') {
        return !item.meVisited && item.userVisited;
      }

      if (activeFilter === 'meOnly') {
        return item.meVisited && !item.userVisited;
      }

      return !item.meVisited && !item.userVisited;
    });

    const firstName = data.name.split(' ')[0] || data.name;
    const subtitleBase = data.collectorSinceYear
      ? `Wandert seit ${data.collectorSinceYear}`
      : 'Harz Wanderbuddy';
    const subtitleSuffix =
      data.relationship === 'friend'
        ? 'Freund'
        : data.relationship === 'incoming_request'
          ? 'Anfrage erhalten'
          : data.relationship === 'outgoing_request'
            ? 'Anfrage gesendet'
            : 'Noch nicht verbunden';

    return {
      mode: 'user',
      name: data.name,
      subtitle: `${subtitleBase} • ${subtitleSuffix}`,
      headerAction: {
        type: 'back',
        onPress: () => router.back(),
      },
      avatarColor: '#dde9df',
      avatarImage: data.picture,
      stats: [
        { label: 'Besucht', value: String(data.visitedCount) },
        { label: 'Abschluss', value: `${data.completionPercent}%` },
        { label: 'Gemeinsam', value: String(data.sharedVisitedCount) },
      ],
      actionCard:
        data.relationship === 'friend'
          ? {
              type: 'friendship',
              statusLabel: 'Verbunden',
              toggleLabel: 'Darf fuer mich stempeln',
              value: data.isAllowedToStampForMe,
              busy: isMutating,
              onToggle: (value) => {
                void (async () => {
                  if (!accessToken || !data.friendshipId) {
                    return;
                  }

                  setIsMutating(true);

                  try {
                    await updateFriendshipPermission(accessToken, data.friendshipId, value);
                    await loadProfile();
                  } catch (nextError) {
                    await handleMutationError(nextError, 'Freundschaft konnte nicht aktualisiert werden');
                  } finally {
                    setIsMutating(false);
                  }
                })();
              },
              removeLabel: 'Freund entfernen',
              onRemove: () => {
                if (!accessToken || !data.friendshipId) {
                  return;
                }

                Alert.alert(
                  'Freund entfernen?',
                  'Diese Freundschaft wird getrennt. Du kannst spaeter erneut eine Anfrage senden.',
                  [
                    {
                      text: 'Abbrechen',
                      style: 'cancel',
                    },
                    {
                      text: 'Entfernen',
                      style: 'destructive',
                      onPress: () => {
                        void (async () => {
                          setIsMutating(true);

                          try {
                            await removeFriendship(accessToken, data.friendshipId!);
                            await loadProfile();
                          } catch (nextError) {
                            await handleMutationError(nextError, 'Freundschaft konnte nicht entfernt werden');
                          } finally {
                            setIsMutating(false);
                          }
                        })();
                      },
                    },
                  ]
                );
              },
            }
          : data.relationship === 'incoming_request'
            ? {
                type: 'button',
                label: 'Anfrage annehmen',
                busy: isMutating,
                onPress: () => {
                  void (async () => {
                    if (!accessToken || !data.pendingRequestId) {
                      return;
                    }

                    setIsMutating(true);

                    try {
                      await acceptPendingFriendshipRequest(accessToken, data.pendingRequestId);
                      await loadProfile();
                    } catch (nextError) {
                      await handleMutationError(nextError, 'Anfrage konnte nicht bestaetigt werden');
                    } finally {
                      setIsMutating(false);
                    }
                  })();
                },
              }
            : data.relationship === 'outgoing_request'
              ? {
                  type: 'button',
                  label: 'Gesendet',
                  disabled: true,
                  muted: true,
                  onPress: () => undefined,
                }
              : {
                  type: 'button',
                  label: 'Als Freund hinzufuegen',
                  busy: isMutating,
                  onPress: () => {
                    void (async () => {
                      if (!accessToken) {
                        return;
                      }

                      setIsMutating(true);

                      try {
                        await createFriendRequest(accessToken, data.userId);
                        await loadProfile();
                      } catch (nextError) {
                        await handleMutationError(nextError, 'Anfrage konnte nicht gesendet werden');
                      } finally {
                        setIsMutating(false);
                      }
                    })();
                },
              },
      latestVisits: data.latestVisits,
      latestVisitsEmptyText: 'Noch keine Besuche von diesem Profil vorhanden.',
      onVisitPress: (stampId) => router.push(`/stamps/${stampId}` as never),
      friendsList: {
        items: data.friends.map((friend) => ({
          id: friend.id,
          name: friend.name,
          image: friend.picture,
          onPress: () => router.push(`/profile/${encodeURIComponent(friend.id)}` as never),
        })),
        emptyText: 'Dieses Profil hat aktuell keine Freunde sichtbar.',
      },
      stampChips: [
        { key: 'shared', label: `Gemeinsam ${data.stampBuckets.shared}`, tone: 'success' },
        { key: 'neither', label: `Keiner ${data.stampBuckets.neither}`, tone: 'subtle' },
        { key: 'friendOnly', label: `Nur ${firstName} ${data.stampBuckets.friendOnly}`, tone: 'sand' },
        { key: 'meOnly', label: `Nur ich ${data.stampBuckets.meOnly}`, tone: 'rose' },
      ],
      activeStampChip: activeFilter,
      onSelectStampChip: (key) => setActiveFilter(key as ComparisonFilter),
      stampItems: filteredStamps.map((item) => ({
        kind: 'compare' as const,
        stamp: item.stamp,
        meVisited: item.meVisited,
        otherVisited: item.userVisited,
      })),
      onStampPress: (stampId) => router.push(`/stamps/${stampId}` as never),
      emptyStampText: 'Keine Stempelstellen fuer diesen Vergleich verfuegbar.',
      onRefresh: () => void loadProfile(true),
      refreshing: isRefreshing,
    };
  }, [accessToken, activeFilter, data, handleMutationError, isMutating, isRefreshing, loadProfile, router]);

  if (!userId) {
    return <ProfileErrorState body="Keine Benutzer-ID uebergeben." title="Profil konnte nicht geladen werden" />;
  }

  if (isLoading) {
    return <ProfileLoadingState label="Freundesprofil wird geladen..." />;
  }

  if (error || !viewModel) {
    return (
      <ProfileErrorState
        body={error || 'Keine Daten verfuegbar.'}
        title="Freundesprofil konnte nicht geladen werden"
      />
    );
  }

  return <ProfileView data={viewModel} />;
}
