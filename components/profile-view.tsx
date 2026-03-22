import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  type ImageStyle,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FriendsList } from '@/components/friends-list';
import { useAuth } from '@/lib/auth';
import { buildAuthenticatedImageSource } from '@/lib/images';
import type { Stampbox } from '@/lib/api';

type HeaderAction =
  | {
      type: 'back';
      onPress: () => void;
    }
  | {
      type: 'edit';
      label: string;
      onPress: () => void;
    };

type ProfileActionCard =
  | {
      type: 'friendship';
      statusLabel: string;
      toggleLabel: string;
      value: boolean;
      busy?: boolean;
      removeLabel: string;
      onToggle: (value: boolean) => void;
      onRemove: () => void;
    }
  | {
      type: 'button';
      label: string;
      onPress: () => void;
      disabled?: boolean;
      muted?: boolean;
      busy?: boolean;
    };

type StampChip = {
  key: string;
  label: string;
  tone?: 'success' | 'sand' | 'rose' | 'brown' | 'subtle';
};

type SimpleStampItem = {
  kind: 'simple';
  stamp: Stampbox;
};

type CompareStampItem = {
  kind: 'compare';
  stamp: Stampbox;
  meVisited: boolean;
  otherVisited: boolean;
};

export type ProfileViewModel = {
  mode: 'self' | 'user';
  name: string;
  subtitle: string;
  headerAction?: HeaderAction;
  avatarColor?: string;
  avatarImage?: string;
  stats: {
    label: string;
    value: string;
  }[];
  actionCard?: ProfileActionCard;
  achievements?: {
    id: string;
    label: string;
    value: string;
  }[];
  latestVisits: {
    id: string;
    stampId?: string;
    stampNumber?: string;
    stampName: string;
    visitedAt?: string;
    heroImageUrl?: string;
  }[];
  latestVisitsEmptyText: string;
  onVisitPress?: (stampId: string) => void;
  friendSummary?: {
    name: string;
    subtitle: string;
    image?: string;
    onPress: () => void;
  };
  friendsList?: {
    items: {
      id: string;
      name: string;
      image?: string;
      subtitle?: string;
      onPress: () => void;
    }[];
    emptyText: string;
  };
  stampsTitle?: string;
  stampChips: StampChip[];
  activeStampChip: string;
  onSelectStampChip: (key: string) => void;
  stampItems: (SimpleStampItem | CompareStampItem)[];
  onStampPress: (stampId: string) => void;
  emptyStampText: string;
  emptyStampIllustration?: React.ComponentProps<typeof Image>['source'];
  footerButtons?: {
    key: string;
    label: string;
    onPress: () => void;
  }[];
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshHint?: string;
  showDeferredSkeletons?: boolean;
};

const DEFAULT_VISIBLE_FRIENDS = 3;

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

function avatarColor(index = 0) {
  const colors = ['#dde9df', '#eadfcb', '#d7e2ec', '#e6d9e9'];
  return colors[index % colors.length];
}

function getTrimmedText(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmedValue = value.trim();
  return trimmedValue || fallback;
}

function artworkGradient(index: number, visited: boolean) {
  if (visited) {
    return index % 2 === 0
      ? (['#458962', '#8fd2a4'] as const)
      : (['#4a8464', '#c2dfae'] as const);
  }

  return index % 2 === 0
    ? (['#b6beac', '#e1d2bd'] as const)
    : (['#a6b39c', '#d7cfbb'] as const);
}

function HeaderAvatar({
  image,
  color,
  compact,
}: {
  image?: string;
  color: string;
  compact: boolean;
}) {
  const { accessToken } = useAuth();

  if (image) {
    return (
      <Image
        contentFit="cover"
        source={buildAuthenticatedImageSource(image, accessToken)}
        style={[
          compact ? styles.avatarCompact : styles.avatarPlaceholder,
          styles.avatarImage,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        compact ? styles.avatarCompact : styles.avatarPlaceholder,
        { backgroundColor: color },
      ]}
    />
  );
}

function stampArtworkUri(stamp?: Stampbox) {
  return stamp?.heroImageUrl?.trim() || stamp?.image?.trim() || '';
}

function StampArtwork({
  index,
  visited,
  imageUri,
  style,
}: {
  index: number;
  visited: boolean;
  imageUri?: string;
  style: StyleProp<ImageStyle>;
}) {
  const { accessToken } = useAuth();

  if (imageUri) {
    return (
      <Image
        contentFit="cover"
        source={buildAuthenticatedImageSource(imageUri, accessToken)}
        style={style}
      />
    );
  }

  return <LinearGradient colors={artworkGradient(index, visited)} style={style} />;
}

function chipToneStyle(tone?: StampChip['tone']) {
  switch (tone) {
    case 'success':
      return [styles.countChipSuccess, styles.countChipLabelSuccess] as const;
    case 'sand':
      return [styles.countChipSand, styles.countChipLabelSand] as const;
    case 'rose':
      return [styles.countChipRose, styles.countChipLabelRose] as const;
    case 'brown':
      return [styles.countChipBrown, styles.countChipLabelBrown] as const;
    case 'subtle':
      return [styles.countChipSubtle, styles.countChipLabelSubtle] as const;
    default:
      return [styles.countChipSand, styles.countChipLabelSand] as const;
  }
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

function VisitRow({
  visit,
  index,
  onPress,
}: {
  visit: ProfileViewModel['latestVisits'][number];
  index: number;
  onPress?: (stampId: string) => void;
}) {
  const disabled = !visit.stampId || !onPress;

  return (
    <Pressable
      disabled={disabled}
      onPress={() => visit.stampId && onPress?.(visit.stampId)}
      style={({ pressed }) => [styles.rowCard, pressed && !disabled && styles.pressed]}>
      <StampArtwork imageUri={visit.heroImageUrl} index={index} style={styles.rowArtwork} visited />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>
          {visit.stampNumber || '--'} {'\u2022'} {visit.stampName}
        </Text>
        <Text style={styles.rowSubtitle}>{formatVisitDate(visit.visitedAt)}</Text>
      </View>
      {!disabled ? <Feather color="#2e6b4b" name="chevron-right" size={18} /> : null}
    </Pressable>
  );
}

function StampComparisonRow({
  item,
  index,
  onPress,
}: {
  item: CompareStampItem;
  index: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.stampCompareRow, pressed && styles.pressed]}>
      <StampArtwork
        imageUri={stampArtworkUri(item.stamp)}
        index={index}
        style={styles.stampCompareArtwork}
        visited={item.meVisited || item.otherVisited}
      />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>
          {item.stamp.number || '--'} {'\u2022'} {item.stamp.name}
        </Text>
        <Text numberOfLines={2} style={styles.rowSubtitle}>
          {getTrimmedText(item.stamp.description, 'Keine Beschreibung verfuegbar.')}
        </Text>
      </View>
      <View style={styles.stampCompareStatus}>
        <Text style={[styles.stampCompareLabel, item.meVisited && styles.stampCompareLabelActive]}>
          Ich {item.meVisited ? '✓' : '·'}
        </Text>
        <Text
          style={[
            styles.stampCompareLabel,
            item.otherVisited && styles.stampCompareLabelActive,
          ]}>
          Freund {item.otherVisited ? '✓' : '·'}
        </Text>
      </View>
    </Pressable>
  );
}

function SimpleStampRow({
  item,
  index,
  onPress,
}: {
  item: SimpleStampItem;
  index: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.stampCompareRow, pressed && styles.pressed]}>
      <StampArtwork
        imageUri={stampArtworkUri(item.stamp)}
        index={index}
        style={styles.stampCompareArtwork}
        visited={!!item.stamp.hasVisited}
      />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>
          {item.stamp.number || '--'} {'\u2022'} {item.stamp.name}
        </Text>
        <Text numberOfLines={2} style={styles.rowSubtitle}>
          {getTrimmedText(item.stamp.description, 'Keine Beschreibung verfuegbar.')}
        </Text>
      </View>
      <Feather color="#2e6b4b" name="chevron-right" size={18} />
    </Pressable>
  );
}

function SkeletonBar({ width }: { width: number | `${number}%` }) {
  return <View style={[styles.skeletonBar, { width }]} />;
}

function SkeletonVisitRow() {
  return (
    <View style={styles.skeletonRow}>
      <View style={styles.skeletonArtwork} />
      <View style={styles.skeletonBody}>
        <SkeletonBar width="58%" />
        <SkeletonBar width="42%" />
      </View>
    </View>
  );
}

function SkeletonFriendRow() {
  return (
    <View style={styles.skeletonFriendRow}>
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonBody}>
        <SkeletonBar width="46%" />
        <SkeletonBar width="34%" />
      </View>
    </View>
  );
}

export function ProfileLoadingState({ label }: { label: string }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <ActivityIndicator color="#2e6b4b" size="large" />
        <Text style={styles.helperText}>{label}</Text>
      </View>
    </SafeAreaView>
  );
}

export function ProfileErrorState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>{title}</Text>
        <Text style={styles.errorBody}>{body}</Text>
      </View>
    </SafeAreaView>
  );
}

export function ProfileView({ data }: { data: ProfileViewModel }) {
  const actionCard = data.actionCard;
  const [showAllFriends, setShowAllFriends] = useState(false);

  useEffect(() => {
    setShowAllFriends(false);
  }, [data.mode, data.name, data.friendsList?.items.length]);

  const visibleFriends = useMemo(() => {
    if (!data.friendsList) {
      return [];
    }

    return showAllFriends
      ? data.friendsList.items
      : data.friendsList.items.slice(0, DEFAULT_VISIBLE_FRIENDS);
  }, [data.friendsList, showAllFriends]);

  const hiddenFriendCount = data.friendsList
    ? Math.max(0, data.friendsList.items.length - DEFAULT_VISIBLE_FRIENDS)
    : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInset={{ bottom: 160 }}
        refreshControl={
          data.onRefresh ? (
            <RefreshControl
              onRefresh={data.onRefresh}
              refreshing={!!data.refreshing}
              tintColor="#2e6b4b"
            />
          ) : undefined
        }
        scrollIndicatorInsets={{ bottom: 160 }}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={styles.headerRow}>
          {data.headerAction?.type === 'back' ? (
            <Pressable
              onPress={data.headerAction.onPress}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Feather color="#1e2a1e" name="arrow-left" size={16} />
            </Pressable>
          ) : null}
          <View style={styles.heroRow}>
            <View style={styles.avatarBadgeWrap}>
              <HeaderAvatar
                color={data.avatarColor || avatarColor()}
                compact={false}
                image={data.avatarImage}
              />
              <View style={styles.profileBadge}>
                <Text style={styles.profileBadgeLabel}>WANDERER</Text>
              </View>
            </View>
            <View style={styles.headerBody}>
              <Text style={styles.headerName}>{data.name}</Text>
              <Text style={styles.headerMeta}>{data.subtitle}</Text>
              {data.headerAction?.type === 'edit' ? (
                <Pressable
                  onPress={data.headerAction.onPress}
                  style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
                  <Text style={styles.editButtonLabel}>{data.headerAction.label}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {data.refreshHint ? <Text style={styles.refreshHint}>{data.refreshHint}</Text> : null}

        <View style={styles.statsCard}>
          {data.showDeferredSkeletons
            ? Array.from({ length: 3 }).map((_, index) => (
                <View key={`stat-skeleton-${index}`} style={styles.statBlock}>
                  <SkeletonBar width="54%" />
                  <View style={styles.statSkeletonGap} />
                  <SkeletonBar width="38%" />
                </View>
              ))
            : data.stats.map((stat) => (
                <View key={stat.label} style={styles.statBlock}>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  <Text style={styles.statValue}>{stat.value}</Text>
                </View>
              ))}
        </View>

        {data.showDeferredSkeletons ? (
          <View style={styles.actionCard}>
            <SkeletonBar width="34%" />
            <View style={styles.actionCardSkeletonGap} />
            <SkeletonBar width="72%" />
            <SkeletonBar width="48%" />
          </View>
        ) : actionCard ? (
          <View style={styles.actionCard}>
            <Text style={styles.actionCardTitle}>Freundschaft</Text>
            {actionCard.type === 'friendship' ? (
              <>
                <View style={styles.actionCardStack}>
                  <View style={styles.statusTile}>
                    <Text style={styles.statusTileLabel}>{actionCard.statusLabel}</Text>
                  </View>
                  <View style={styles.toggleTile}>
                    <View style={styles.toggleHeader}>
                      <Text style={styles.toggleLabel}>{actionCard.toggleLabel}</Text>
                      <Text style={styles.toggleHint}>
                        {actionCard.value ? 'Aktiv' : 'Inaktiv'}
                      </Text>
                    </View>
                    <Switch
                      disabled={actionCard.busy}
                      onValueChange={actionCard.onToggle}
                      thumbColor="#f5f3ee"
                      trackColor={{ false: '#c9c2b8', true: '#2e6b4b' }}
                      value={actionCard.value}
                    />
                  </View>
                  <Pressable
                    disabled={actionCard.busy}
                    onPress={actionCard.onRemove}
                    style={({ pressed }) => [
                      styles.removeButton,
                      actionCard.busy && styles.actionPrimaryButtonDisabled,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.removeButtonLabel}>
                      {actionCard.busy ? '...' : actionCard.removeLabel}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                disabled={actionCard.disabled || actionCard.busy}
                onPress={actionCard.onPress}
                style={({ pressed }) => [
                  styles.actionPrimaryButton,
                  actionCard.muted && styles.actionPrimaryButtonMuted,
                  (actionCard.disabled || actionCard.busy) && styles.actionPrimaryButtonDisabled,
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.actionPrimaryLabel,
                    actionCard.muted && styles.actionPrimaryLabelMuted,
                  ]}>
                  {actionCard.busy ? '...' : actionCard.label}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {data.achievements && data.achievements.length > 0 ? (
          <ProfileSection title="Erfolge & Meilensteine">
            <View style={styles.achievementRow}>
              {data.achievements.map((achievement) => (
                <View key={achievement.id} style={styles.achievementCard}>
                  <Text style={styles.achievementLabel}>{achievement.label}</Text>
                  <Text style={styles.achievementValue}>{achievement.value}</Text>
                </View>
              ))}
            </View>
          </ProfileSection>
        ) : null}

        <ProfileSection title="Letzte Besuche">
          {data.showDeferredSkeletons ? (
            <>
              <SkeletonVisitRow />
              <SkeletonVisitRow />
            </>
          ) : data.latestVisits.length > 0 ? (
            data.latestVisits.map((visit, index) => (
              <VisitRow key={visit.id} index={index} onPress={data.onVisitPress} visit={visit} />
            ))
          ) : (
            <Text style={styles.emptyText}>{data.latestVisitsEmptyText}</Text>
          )}
        </ProfileSection>

        {data.friendSummary ? (
          <ProfileSection title="Freunde">
            <FriendsList
              items={[
                {
                  id: 'friend-summary',
                  image: data.friendSummary.image,
                  name: data.friendSummary.name,
                  onPress: data.friendSummary.onPress,
                  subtitle: data.friendSummary.subtitle,
                },
              ]}
            />
          </ProfileSection>
        ) : null}

        {data.friendsList ? (
          <ProfileSection title="Freunde">
            {data.showDeferredSkeletons ? (
              <>
                <SkeletonFriendRow />
                <SkeletonFriendRow />
                <SkeletonFriendRow />
              </>
            ) : data.friendsList.items.length > 0 ? (
              <>
                <FriendsList
                  items={visibleFriends.map((friend) => ({
                    id: friend.id,
                    image: friend.image,
                    name: friend.name,
                    onPress: friend.onPress,
                    subtitle: friend.subtitle,
                  }))}
                />
                {hiddenFriendCount > 0 ? (
                  <Pressable
                    onPress={() => setShowAllFriends((current) => !current)}
                    style={({ pressed }) => [styles.expandFriendsButton, pressed && styles.pressed]}>
                    <Text style={styles.expandFriendsLabel}>
                      {showAllFriends ? 'Weniger anzeigen' : `${hiddenFriendCount} weitere anzeigen`}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text style={styles.emptyText}>{data.friendsList.emptyText}</Text>
            )}
          </ProfileSection>
        ) : null}

        <ProfileSection title={data.stampsTitle || 'Stempelstellen'}>
          {data.showDeferredSkeletons ? (
            <>
              <View style={styles.skeletonChipRow}>
                <View style={styles.skeletonChip} />
                <View style={styles.skeletonChip} />
                <View style={styles.skeletonChipShort} />
              </View>
              <SkeletonVisitRow />
              <SkeletonVisitRow />
              <SkeletonVisitRow />
            </>
          ) : (
            <ScrollView
              contentContainerStyle={styles.chipRow}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {data.stampChips.map((chip) => {
                const [backgroundStyle, labelToneStyle] = chipToneStyle(chip.tone);
                const active = data.activeStampChip === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => data.onSelectStampChip(chip.key)}
                    style={({ pressed }) => [
                      styles.countChip,
                      backgroundStyle,
                      active && styles.countChipActive,
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.countChipLabel,
                        labelToneStyle,
                        active && styles.countChipLabelActive,
                      ]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {!data.showDeferredSkeletons && data.stampItems.length > 0 ? (
            data.stampItems.map((item, index) =>
              item.kind === 'compare' ? (
                <StampComparisonRow
                  key={item.stamp.ID}
                  index={index}
                  item={item}
                  onPress={() => data.onStampPress(item.stamp.ID)}
                />
              ) : (
                <SimpleStampRow
                  key={item.stamp.ID}
                  index={index}
                  item={item}
                  onPress={() => data.onStampPress(item.stamp.ID)}
                />
              )
            )
          ) : !data.showDeferredSkeletons ? (
            data.emptyStampIllustration ? (
              <View style={styles.emptyStampState}>
                <Image
                  contentFit="contain"
                  source={data.emptyStampIllustration}
                  style={styles.emptyStampIllustration}
                />
                <Text style={[styles.emptyText, styles.emptyStampText]}>{data.emptyStampText}</Text>
              </View>
            ) : (
              <Text style={styles.emptyText}>{data.emptyStampText}</Text>
            )
          ) : null}
        </ProfileSection>

        {data.footerButtons?.length ? (
          <View style={styles.footerButtonStack}>
            {data.footerButtons.map((button) => (
              <Pressable
                key={button.key}
                onPress={button.onPress}
                style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}>
                <Text style={styles.logoutLabel}>{button.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f3ee',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 220,
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
    gap: 12,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  avatarBadgeWrap: {
    position: 'relative',
    paddingBottom: 10,
  },
  backButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#f0e9dd',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 24,
  },
  avatarCompact: {
    width: 60,
    height: 60,
    borderRadius: 20,
  },
  avatarImage: {
    overflow: 'hidden',
  },
  headerBody: {
    flex: 1,
    minWidth: 1,
    gap: 8,
  },
  headerName: {
    color: '#1e2a1e',
    fontSize: 31,
    lineHeight: 38,
    fontFamily: 'serif',
    fontWeight: '700',
  },
  headerMeta: {
    color: '#788777',
    fontSize: 13,
    lineHeight: 18,
  },
  editButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#2e6b4b',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  editButtonLabel: {
    color: '#f5f3ee',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  profileBadge: {
    position: 'absolute',
    right: -10,
    bottom: 0,
    backgroundColor: '#e9e2d6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  profileBadgeLabel: {
    color: '#2e3a2e',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
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
  statSkeletonGap: {
    height: 10,
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
  actionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'column',
    gap: 8,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  actionCardSkeletonGap: {
    height: 6,
  },
  actionCardTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  actionCardStack: {
    gap: 8,
  },
  actionCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusTile: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#2e6b4b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statusTileLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  toggleTile: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: '#e9e2d6',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleHeader: {
    flex: 1,
    gap: 4,
  },
  toggleLabel: {
    color: '#2e3a2e',
    fontSize: 13,
    lineHeight: 16,
  },
  toggleHint: {
    color: '#6b7a6b',
    fontSize: 11,
    lineHeight: 14,
  },
  removeButton: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: '#c1a093',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  removeButtonLabel: {
    color: '#2e3a2e',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  actionPrimaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: '#2e6b4b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  actionPrimaryButtonMuted: {
    backgroundColor: '#e9e2d6',
  },
  actionPrimaryButtonDisabled: {
    opacity: 0.7,
  },
  actionPrimaryLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  actionPrimaryLabelMuted: {
    color: '#2e3a2e',
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
  refreshHint: {
    color: '#4d6d56',
    fontSize: 13,
    lineHeight: 18,
    marginTop: -6,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skeletonFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skeletonArtwork: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#ece6db',
  },
  skeletonAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#ece6db',
  },
  skeletonBody: {
    flex: 1,
    gap: 8,
  },
  skeletonBar: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#ece6db',
  },
  skeletonChipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skeletonChip: {
    height: 34,
    width: 120,
    borderRadius: 999,
    backgroundColor: '#ece6db',
  },
  skeletonChipShort: {
    height: 34,
    width: 88,
    borderRadius: 999,
    backgroundColor: '#ece6db',
  },
  achievementRow: {
    flexDirection: 'row',
    gap: 10,
  },
  achievementCard: {
    flex: 1,
    backgroundColor: '#f8f6f1',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  achievementLabel: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  achievementValue: {
    color: '#1e2a1e',
    fontSize: 15,
    lineHeight: 18,
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
  chipRow: {
    gap: 8,
    paddingRight: 8,
  },
  countChip: {
    minWidth: 92,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  countChipActive: {
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#2e6b4b',
  },
  countChipSuccess: {
    backgroundColor: '#e2eee6',
  },
  countChipSand: {
    backgroundColor: '#f0e9dd',
  },
  countChipRose: {
    backgroundColor: '#caa99b',
  },
  countChipBrown: {
    backgroundColor: '#c1a093',
  },
  countChipSubtle: {
    backgroundColor: '#f6f1e8',
  },
  countChipLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  countChipLabelActive: {
    fontWeight: '700',
  },
  countChipLabelSuccess: {
    color: '#2e6b4b',
  },
  countChipLabelSand: {
    color: '#7a6a4a',
  },
  countChipLabelRose: {
    color: '#5e3a33',
  },
  countChipLabelBrown: {
    color: '#1e2a1e',
  },
  countChipLabelSubtle: {
    color: '#7a6a4a',
  },
  stampCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8f6f1',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  stampCompareArtwork: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  stampCompareStatus: {
    alignItems: 'flex-end',
    gap: 4,
  },
  stampCompareLabel: {
    color: '#6b7a6b',
    fontSize: 11,
    lineHeight: 14,
  },
  stampCompareLabelActive: {
    color: '#2e6b4b',
    fontWeight: '600',
  },
  emptyText: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  emptyStampState: {
    alignItems: 'center',
    gap: 8,
  },
  emptyStampIllustration: {
    width: 120,
    height: 120,
  },
  emptyStampText: {
    textAlign: 'center',
  },
  expandFriendsButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#f0e9dd',
  },
  expandFriendsLabel: {
    color: '#2e6b4b',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#f0e9dd',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerButtonStack: {
    gap: 10,
  },
  logoutLabel: {
    color: '#2e3a2e',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.84,
  },
});
