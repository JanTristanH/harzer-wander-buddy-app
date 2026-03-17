import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  removeFriendship,
  updateFriendshipPermission,
} from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';
import { queryKeys, useUserProfileOverviewQuery } from '@/lib/queries';

type ComparisonFilter = 'shared' | 'friendOnly' | 'meOnly' | 'neither';

export default function FriendProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userIdParam = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const userId = userIdParam ? decodeURIComponent(userIdParam) : '';
  const { accessToken, logout } = useAuth();
  const claims = useIdTokenClaims<{ sub?: string }>();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<ComparisonFilter>('shared');
  const [isMutating, setIsMutating] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const { data, error, isFetching, isPending, isPlaceholderData, refetch } =
    useUserProfileOverviewQuery(userId);
  const blockingError = !data ? error : null;

  useEffect(() => {
    if (data?.relationship === 'self') {
      router.replace('/(tabs)/profile' as never);
    }
  }, [data?.relationship, router]);

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

  const invalidateRelationshipQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.friendsOverview(claims?.sub) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.profileOverview(claims?.sub) }),
    ]);
  }, [claims?.sub, queryClient]);

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
                    await refetch();
                    await invalidateRelationshipQueries();
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
                            await refetch();
                            await invalidateRelationshipQueries();
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
                      await refetch();
                      await invalidateRelationshipQueries();
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
                        await refetch();
                        await invalidateRelationshipQueries();
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
          subtitle: `${friend.visitedCount} Stempel • ${friend.completionPercent}%`,
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
      refreshHint:
        isFetching && !isPending ? 'Aktualisiere Profildaten im Hintergrund...' : undefined,
      showDeferredSkeletons: isPlaceholderData,
    };
  }, [accessToken, activeFilter, data, handleMutationError, invalidateRelationshipQueries, isFetching, isMutating, isPending, isPlaceholderData, isPullRefreshing, refetch, router]);

  if (!userId) {
    return <ProfileErrorState body="Keine Benutzer-ID uebergeben." title="Profil konnte nicht geladen werden" />;
  }

  if (isPending && !data) {
    return <ProfileLoadingState label="Freundesprofil wird geladen..." />;
  }

  if (blockingError || !viewModel) {
    return (
      <ProfileErrorState
        body={blockingError?.message || 'Keine Daten verfuegbar.'}
        title="Freundesprofil konnte nicht geladen werden"
      />
    );
  }

  return <ProfileView data={viewModel} />;
}
