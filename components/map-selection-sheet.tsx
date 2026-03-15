import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

type MarkerKind = 'visited-stamp' | 'open-stamp' | 'parking';

export function MapSelectionSheet({
  bottomOffset,
  item,
  metadata,
  onDetailsPress,
  onHeightChange,
}: {
  bottomOffset: number;
  item: {
    kind: MarkerKind;
    title: string;
    description: string;
  };
  metadata: string;
  onDetailsPress?: () => void;
  onHeightChange?: (height: number) => void;
}) {
  return (
    <View
      onLayout={(event: LayoutChangeEvent) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[styles.bottomSheet, { bottom: bottomOffset }]}>
      <View style={styles.detailRow}>
        <LinearGradient
          colors={
            item.kind === 'visited-stamp'
              ? ['#4b875f', '#8fd2a4']
              : item.kind === 'open-stamp'
                ? ['#ab8d7d', '#dbc6b7']
                : ['#2f7dd7', '#6cb1ff']
          }
          style={styles.detailArtwork}
        />

        <View style={styles.detailCopy}>
          <Text numberOfLines={1} style={styles.detailTitle}>
            {item.title}
          </Text>
          <Text numberOfLines={2} style={styles.detailDescription}>
            {item.description}
          </Text>
        </View>

        <View
          style={[
            styles.detailBadge,
            item.kind === 'visited-stamp'
              ? styles.detailBadgeVisited
              : item.kind === 'open-stamp'
                ? styles.detailBadgeOpen
                : styles.detailBadgeParking,
          ]}>
          <Text
            style={[
              styles.detailBadgeText,
              item.kind === 'visited-stamp'
                ? styles.detailBadgeTextVisited
                : item.kind === 'open-stamp'
                  ? styles.detailBadgeTextOpen
                  : styles.detailBadgeTextParking,
            ]}>
            {item.kind === 'visited-stamp'
              ? 'Besucht'
              : item.kind === 'open-stamp'
                ? 'Unbesucht'
                : 'Parkplatz'}
          </Text>
        </View>
      </View>

      <View style={styles.detailMetaRow}>
        <Text numberOfLines={1} style={styles.detailMeta}>
          {metadata}
        </Text>
      </View>

      {onDetailsPress ? (
        <Pressable onPress={onDetailsPress} style={({ pressed }) => [styles.detailAction, pressed && styles.pressed]}>
          <Text style={styles.detailActionLabel}>Details oeffnen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 6,
  },
  bottomSheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#d8ded6',
    alignSelf: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailArtwork: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  detailCopy: {
    flex: 1,
    minWidth: 1,
  },
  detailTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  detailDescription: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  detailBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailBadgeVisited: {
    backgroundColor: '#deebe2',
  },
  detailBadgeOpen: {
    backgroundColor: '#f0e7e0',
  },
  detailBadgeParking: {
    backgroundColor: '#e3effc',
  },
  detailBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  detailBadgeTextVisited: {
    color: '#2e6b4b',
  },
  detailBadgeTextOpen: {
    color: '#7d5f52',
  },
  detailBadgeTextParking: {
    color: '#2f7dd7',
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailMeta: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  detailAction: {
    backgroundColor: '#2e6b4b',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailActionLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.85,
  },
});
