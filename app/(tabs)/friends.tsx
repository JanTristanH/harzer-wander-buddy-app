import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import {
  acceptPendingFriendshipRequest,
  fetchFriendsOverview,
  type FriendsOverviewData,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

type FriendFilter = 'friends' | 'requests' | 'sent';

const FILTER_LABELS: Record<FriendFilter, string> = {
  friends: 'Meine Freunde',
  requests: 'Anfragen',
  sent: 'Gesendet',
};

const AVATAR_COLORS = ['#DDE9DF', '#EADFCB', '#D7E2EC', '#E6D9E9'];

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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.pressed]}>
      <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function FriendRow({
  name,
  subtitle,
  index,
  actionLabel,
  actionDisabled,
  onActionPress,
}: {
  name: string;
  subtitle: string;
  index: number;
  actionLabel?: string;
  actionDisabled?: boolean;
  onActionPress?: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.friendCard, pressed && styles.pressed]}>
      <View style={[styles.avatarPlaceholder, { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }]} />
      <View style={styles.friendBody}>
        <Text style={styles.friendName}>{name}</Text>
        <Text style={styles.friendMeta}>{subtitle}</Text>
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          disabled={actionDisabled}
          onPress={onActionPress}
          style={({ pressed }) => [
            styles.inlineActionButton,
            actionDisabled && styles.inlineActionButtonDisabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.inlineActionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : (
        <Feather color="#2E6B4B" name="chevron-right" size={18} />
      )}
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

export default function FriendsScreen() {
  const { accessToken, logout } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FriendFilter>('friends');
  const [data, setData] = useState<FriendsOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingFriendshipId, setAcceptingFriendshipId] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);

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
    }
  }, [accessToken, logout]);

  useFocusEffect(
    useCallback(() => {
      void loadFriends();
    }, [loadFriends])
  );

  const requestsLabel = `Anfragen (${data?.incomingRequestCount ?? 0})`;
  const sentLabel = `Gesendet${data && data.outgoingRequestCount > 0 ? ` (${data.outgoingRequestCount})` : ''}`;

  const handleAcceptRequest = useCallback(
    async (friendshipId: string) => {
      if (!accessToken) {
        return;
      }

      setAcceptingFriendshipId(friendshipId);

      try {
        await acceptPendingFriendshipRequest(accessToken, friendshipId);
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
        setAcceptingFriendshipId(null);
      }
    },
    [accessToken, loadFriends, logout]
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
              <View style={styles.cardsColumn}>
                {data.friends.map((friend, index) => (
                  <FriendRow
                    key={friend.id}
                    index={index}
                    name={friend.name}
                    subtitle={`${friend.visitedCount} Stempel • ${friend.completionPercent}%`}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                title="Noch keine Freunde"
                body="Sobald du Freunde verbunden hast, erscheinen sie hier mit ihrem Fortschritt."
              />
            )
          ) : null}

          {!isLoading && !error && activeFilter === 'requests' ? (
            data && data.incomingRequests.length > 0 ? (
              <View style={styles.cardsColumn}>
                {data.incomingRequests.map((request, index) => (
                  <FriendRow
                    key={request.id}
                    index={index}
                    name={request.name}
                    subtitle="Moechte mit dir wandern"
                    actionLabel={acceptingFriendshipId === request.friendshipId ? '...' : 'Annehmen'}
                    actionDisabled={acceptingFriendshipId === request.friendshipId}
                    onActionPress={() => void handleAcceptRequest(request.friendshipId)}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                title="Keine offenen Anfragen"
                body="Zurzeit liegen keine eingehenden Freundschaftsanfragen vor."
              />
            )
          ) : null}

          {!isLoading && !error && activeFilter === 'sent' ? (
            data && data.outgoingRequests.length > 0 ? (
              <View style={styles.cardsColumn}>
                {data.outgoingRequests.map((request, index) => (
                  <FriendRow
                    key={request.id}
                    index={index}
                    name={request.name}
                    subtitle="Anfrage gesendet"
                  />
                ))}
              </View>
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
          style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}>
          <Feather color="#F5F3EE" name="search" size={24} />
        </Pressable>
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
  cardsColumn: {
    gap: 16,
  },
  friendCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: '#141E14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  avatarPlaceholder: {
    borderRadius: 16,
    height: 44,
    width: 44,
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
  inlineActionButton: {
    backgroundColor: '#2E6B4B',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineActionButtonDisabled: {
    opacity: 0.65,
  },
  inlineActionLabel: {
    color: '#F5F3EE',
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
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
  pressed: {
    opacity: 0.88,
  },
});
