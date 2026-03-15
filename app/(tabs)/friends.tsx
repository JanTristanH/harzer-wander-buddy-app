import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FriendsList, FriendAvatar } from '@/components/friends-list';
import { Fonts } from '@/constants/theme';
import {
  acceptPendingFriendshipRequest,
  createFriendRequest,
  fetchFriendsOverview,
  searchUsers,
  type FriendsOverviewData,
  type SearchUserResult,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

type FriendFilter = 'friends' | 'requests' | 'sent';

const FILTER_LABELS: Record<FriendFilter, string> = {
  friends: 'Meine Freunde',
  requests: 'Anfragen',
  sent: 'Gesendet',
};

function FriendFilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        active && styles.filterChipActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function SearchResultRow({
  result,
  index,
  status,
  disabled,
  onRowPress,
  onPress,
}: {
  result: SearchUserResult;
  index: number;
  status: 'request' | 'sent' | 'friend' | 'self';
  disabled: boolean;
  onRowPress: () => void;
  onPress: () => void;
}) {
  const actionLabel =
    status === 'sent' ? 'Gesendet' : status === 'friend' ? 'Verbunden' : status === 'self' ? 'Du' : 'Anfrage';

  return (
    <View style={styles.searchResultRow}>
      <Pressable
        onPress={onRowPress}
        style={({ pressed }) => [styles.searchResultPressable, pressed && styles.pressed]}>
        <FriendAvatar image={result.picture} index={index} radius={12} size={40} />
        <View style={styles.friendBody}>
          <Text style={styles.friendName}>{result.name}</Text>
          <Text style={styles.friendMeta}>@{result.id}</Text>
        </View>
      </Pressable>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.searchActionButton,
          status !== 'request' && styles.searchActionButtonMuted,
          disabled && styles.inlineActionButtonDisabled,
          pressed && styles.pressed,
        ]}>
        <Text
          style={[
            styles.searchActionLabel,
            status !== 'request' && styles.searchActionLabelMuted,
          ]}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FriendFilter>('friends');
  const [data, setData] = useState<FriendsOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptingPendingRequestId, setAcceptingPendingRequestId] = useState<string | null>(null);
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [submittingUserId, setSubmittingUserId] = useState<string | null>(null);

  const loadFriends = useCallback(async (refresh = false) => {
    if (!accessToken) {
      return;
    }

    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const nextData = await fetchFriendsOverview(accessToken);
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
  }, [accessToken, logout]);

  useFocusEffect(
    useCallback(() => {
      void loadFriends();
    }, [loadFriends])
  );

  useEffect(() => {
    if (!isSearchModalVisible) {
      return;
    }

    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearchLoading(false);
      return;
    }

    if (!accessToken) {
      return;
    }

    let cancelled = false;
    setIsSearchLoading(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const results = await searchUsers(accessToken, normalizedQuery);
          if (cancelled) {
            return;
          }

          setSearchResults(results);
          setSearchError(null);
        } catch (nextError) {
          if (cancelled) {
            return;
          }

          setSearchError(nextError instanceof Error ? nextError.message : 'Unknown error');
          setSearchResults([]);
        } finally {
          if (!cancelled) {
            setIsSearchLoading(false);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessToken, isSearchModalVisible, searchQuery]);

  const requestsLabel = `Anfragen (${data?.incomingRequestCount ?? 0})`;
  const sentLabel = `Gesendet${data && data.outgoingRequestCount > 0 ? ` (${data.outgoingRequestCount})` : ''}`;

  const sentRequestIds = useMemo(() => new Set((data?.outgoingRequests ?? []).map((item) => item.userId)), [data]);
  const friendIds = useMemo(() => new Set((data?.friends ?? []).map((item) => item.id)), [data]);

  const closeSearchModal = useCallback(() => {
    setIsSearchModalVisible(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setIsSearchLoading(false);
    setSubmittingUserId(null);
  }, []);

  const handleSearchProfilePress = useCallback(
    (userId: string) => {
      closeSearchModal();
      requestAnimationFrame(() => {
        router.push(`/profile/${encodeURIComponent(userId)}` as never);
      });
    },
    [closeSearchModal, router]
  );

  const handleAcceptRequest = useCallback(
    async (pendingRequestId: string) => {
      if (!accessToken) {
        return;
      }

      setAcceptingPendingRequestId(pendingRequestId);

      try {
        await acceptPendingFriendshipRequest(accessToken, pendingRequestId);
        await loadFriends();
      } catch (nextError) {
        if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
          await logout();
          return;
        }

        Alert.alert(
          'Anfrage konnte nicht bestaetigt werden',
          nextError instanceof Error ? nextError.message : 'Unknown error'
        );
      } finally {
        setAcceptingPendingRequestId(null);
      }
    },
    [accessToken, loadFriends, logout]
  );

  const handleCreateRequest = useCallback(
    async (userId: string) => {
      if (!accessToken) {
        return;
      }

      setSubmittingUserId(userId);

      try {
        await createFriendRequest(accessToken, userId);
        const refreshed = await fetchFriendsOverview(accessToken);
        setData(refreshed);
        setSearchResults((current) => current.slice());
      } catch (nextError) {
        if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
          await logout();
          return;
        }

        Alert.alert(
          'Anfrage konnte nicht gesendet werden',
          nextError instanceof Error ? nextError.message : 'Unknown error'
        );
      } finally {
        setSubmittingUserId(null);
      }
    },
    [accessToken, logout]
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              onRefresh={() => void loadFriends(true)}
              refreshing={isRefreshing}
              tintColor="#2E6B4B"
            />
          }
          showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Freunde</Text>

          <View style={styles.filterRow}>
            <FriendFilterChip
              active={activeFilter === 'friends'}
              label={FILTER_LABELS.friends}
              onPress={() => setActiveFilter('friends')}
            />
            <FriendFilterChip
              active={activeFilter === 'requests'}
              label={requestsLabel}
              onPress={() => setActiveFilter('requests')}
            />
            <FriendFilterChip
              active={activeFilter === 'sent'}
              label={sentLabel}
              onPress={() => setActiveFilter('sent')}
            />
          </View>

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#2E6B4B" size="large" />
              <Text style={styles.helperText}>Freunde werden geladen...</Text>
            </View>
          ) : null}

          {!isLoading && error ? (
            <EmptyState title="Freunde konnten nicht geladen werden" body={error} />
          ) : null}

          {!isLoading && !error && activeFilter === 'friends' ? (
            data && data.friends.length > 0 ? (
              <FriendsList
                items={data.friends.map((friend) => ({
                  id: friend.id,
                  image: friend.picture,
                  name: friend.name,
                  onPress: () => router.push(`/profile/${encodeURIComponent(friend.id)}` as never),
                  subtitle: `${friend.visitedCount} Stempel • ${friend.completionPercent}%`,
                }))}
              />
            ) : (
              <EmptyState
                title="Noch keine Freunde"
                body="Sobald du Freunde verbunden hast, erscheinen sie hier mit ihrem Fortschritt."
              />
            )
          ) : null}

          {!isLoading && !error && activeFilter === 'requests' ? (
            data && data.incomingRequests.length > 0 ? (
              <FriendsList
                items={data.incomingRequests.map((request) => ({
                  id: request.id,
                  image: request.picture,
                  name: request.name,
                  onPress: () => router.push(`/profile/${encodeURIComponent(request.userId)}` as never),
                  subtitle: 'Moechte mit dir wandern',
                  actionLabel: acceptingPendingRequestId === request.pendingRequestId ? '...' : 'Annehmen',
                  actionDisabled: acceptingPendingRequestId === request.pendingRequestId,
                  onActionPress: () => void handleAcceptRequest(request.pendingRequestId),
                }))}
              />
            ) : (
              <EmptyState
                title="Keine offenen Anfragen"
                body="Zurzeit liegen keine eingehenden Freundschaftsanfragen vor."
              />
            )
          ) : null}

          {!isLoading && !error && activeFilter === 'sent' ? (
            data && data.outgoingRequests.length > 0 ? (
              <FriendsList
                items={data.outgoingRequests.map((request) => ({
                  id: request.id,
                  image: request.picture,
                  name: request.name,
                  onPress: () => router.push(`/profile/${encodeURIComponent(request.userId)}` as never),
                  subtitle: 'Anfrage gesendet',
                  actionLabel: 'Gesendet',
                  actionMuted: true,
                  actionDisabled: true,
                  onActionPress: () => undefined,
                }))}
              />
            ) : (
              <EmptyState
                title="Nichts ausstehend"
                body="Du hast aktuell keine gesendeten Freundschaftsanfragen."
              />
            )
          ) : null}
        </ScrollView>

        <Pressable
          accessibilityLabel="Freunde suchen"
          onPress={() => setIsSearchModalVisible(true)}
          style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}>
          <Feather color="#F5F3EE" name="search" size={24} />
        </Pressable>

        <Modal
          animationType="fade"
          transparent
          visible={isSearchModalVisible}
          onRequestClose={closeSearchModal}>
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeSearchModal} />
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Freunde finden</Text>
                <Pressable
                  accessibilityLabel="Suche schliessen"
                  onPress={closeSearchModal}
                  style={({ pressed }) => [styles.modalCloseButton, pressed && styles.pressed]}>
                  <Feather color="#1E2A1E" name="x" size={16} />
                </Pressable>
              </View>

              <View style={styles.searchInputShell}>
                <View style={styles.searchInputIconWrap}>
                  <Feather color="#6B7A6B" name="search" size={14} />
                </View>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  onChangeText={setSearchQuery}
                  placeholder="Name oder Nutzername suchen"
                  placeholderTextColor="#6B7A6B"
                  style={styles.searchInput}
                  value={searchQuery}
                />
              </View>

              <View style={styles.searchResultsColumn}>
                {isSearchLoading ? (
                  <View style={styles.searchStatusWrap}>
                    <ActivityIndicator color="#2E6B4B" size="small" />
                  </View>
                ) : null}

                {!isSearchLoading && searchError ? (
                  <Text style={styles.searchStatusText}>{searchError}</Text>
                ) : null}

                {!isSearchLoading && !searchError && searchQuery.trim().length < 2 ? (
                  <Text style={styles.searchStatusText}>
                    Gib mindestens zwei Zeichen ein, um nach Freunden zu suchen.
                  </Text>
                ) : null}

                {!isSearchLoading &&
                !searchError &&
                searchQuery.trim().length >= 2 &&
                searchResults.length === 0 ? (
                  <Text style={styles.searchStatusText}>Keine passenden Nutzer gefunden.</Text>
                ) : null}

                {!isSearchLoading && !searchError && searchResults.length > 0
                  ? searchResults.map((result, index) => {
                      const status: 'request' | 'sent' | 'friend' | 'self' =
                        result.id === data?.currentUserId
                          ? 'self'
                          : friendIds.has(result.id) || result.isFriend
                            ? 'friend'
                            : sentRequestIds.has(result.id)
                              ? 'sent'
                              : 'request';

                      return (
                        <SearchResultRow
                          key={result.id}
                          disabled={status !== 'request' || submittingUserId === result.id}
                          index={index}
                          onRowPress={() => handleSearchProfilePress(result.id)}
                          onPress={() => void handleCreateRequest(result.id)}
                          result={result}
                          status={status === 'request' && submittingUserId === result.id ? 'sent' : status}
                        />
                      );
                    })
                  : null}
              </View>

            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F3EE',
  },
  screen: {
    flex: 1,
    backgroundColor: '#F5F3EE',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 160,
  },
  title: {
    color: '#1E2A1E',
    fontFamily: Fonts.serif,
    fontSize: 24,
    lineHeight: 30,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: '#2E6B4B',
  },
  filterChipLabel: {
    color: '#2E3A2E',
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  filterChipLabelActive: {
    color: '#F5F3EE',
    fontWeight: '700',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  helperText: {
    color: '#6B7A6B',
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  friendBody: {
    flex: 1,
  },
  friendName: {
    color: '#1E2A1E',
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 2,
  },
  friendMeta: {
    color: '#6B7A6B',
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  inlineActionButtonDisabled: {
    opacity: 0.7,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#141E14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  emptyTitle: {
    color: '#1E2A1E',
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 6,
  },
  emptyBody: {
    color: '#6B7A6B',
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: '#2E6B4B',
    borderRadius: 18,
    bottom: 108,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 20,
    shadowColor: '#141E14',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    width: 52,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(46,58,46,0.35)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    marginHorizontal: 20,
    marginTop: 120,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#141E14',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#1E2A1E',
    fontFamily: Fonts.serif,
    fontSize: 20,
    lineHeight: 24,
  },
  modalCloseButton: {
    alignItems: 'center',
    backgroundColor: '#F0E9DD',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  searchInputShell: {
    alignItems: 'center',
    backgroundColor: '#F6F2EA',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInputIconWrap: {
    alignItems: 'center',
    height: 14,
    justifyContent: 'center',
    width: 14,
  },
  searchInput: {
    color: '#1E2A1E',
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    padding: 0,
  },
  searchResultsColumn: {
    gap: 10,
    minHeight: 120,
  },
  searchResultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  searchResultPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  searchActionButton: {
    backgroundColor: '#2E6B4B',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchActionButtonMuted: {
    backgroundColor: '#E9E2D6',
  },
  searchActionLabel: {
    color: '#F5F3EE',
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  searchActionLabelMuted: {
    color: '#2E3A2E',
  },
  searchStatusWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  searchStatusText: {
    color: '#6B7A6B',
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.88,
  },
});
