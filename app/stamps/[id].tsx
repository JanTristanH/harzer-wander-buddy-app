import { Feather } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Linking,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthGuard } from '@/components/auth-guard';
import { FriendsList } from '@/components/friends-list';
import {
  createStamping,
  deleteStamping,
  updateStamping,
} from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';
import { buildAuthenticatedImageSource } from '@/lib/images';
import { queryKeys, useStampDetailQuery } from '@/lib/queries';

type IdClaims = {
  sub?: string;
};

type CarouselImageItem = {
  id: string;
  uri: string;
  title: string;
  kind: 'current' | 'nearby';
  subtitle?: string;
  imageCaption?: string;
};

const CAROUSEL_DOUBLE_TAP_DELAY_MS = 280;
const CAROUSEL_ZOOM_SCALE = 2;
const CAROUSEL_PAN_THRESHOLD = 2;
const emptyNearbyStampsIllustration = require('@/assets/images/buddy/telescope.png');

function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) {
    return 'Keine Distanz';
  }

  return `${distanceKm.toFixed(1).replace('.', ',')} km`;
}

function formatDuration(durationMinutes: number | null) {
  if (durationMinutes === null) {
    return '';
  }

  return `${durationMinutes} Min`;
}

function formatElevationSummary(elevationGainMeters: number | null, elevationLossMeters: number | null) {
  const parts: string[] = [];

  if (typeof elevationGainMeters === 'number' && Number.isFinite(elevationGainMeters)) {
    parts.push(`↑${Math.round(Math.abs(elevationGainMeters))} m`);
  }

  if (typeof elevationLossMeters === 'number' && Number.isFinite(elevationLossMeters)) {
    parts.push(`↓${Math.round(Math.abs(elevationLossMeters))} m`);
  }

  return parts.length > 0 ? ` • ${parts.join(' ')}` : '';
}

function formatVisitDate(value?: string) {
  if (!value) {
    return 'Unbekanntes Datum';
  }

  return new Date(value).toLocaleString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function getVisitTimestamp(visit: { visitedAt?: string; createdAt?: string }) {
  return visit.visitedAt || visit.createdAt;
}

function formatEditableVisitDate(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const yyyy = date.getFullYear();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

function heroGradient(visited: boolean) {
  return visited
    ? (['#4f8b67', '#79af82', '#d8c88f'] as const)
    : (['#b8bdb1', '#cfd3c8', '#e1d7c5'] as const);
}

function SkeletonLine({
  width,
  height = 14,
}: {
  width: number | `${number}%`;
  height?: number;
}) {
  return <View style={[styles.skeletonLine, { width, height }]} />;
}

function SkeletonRow() {
  return (
    <View style={styles.skeletonRow}>
      <View style={styles.skeletonBadge} />
      <View style={styles.skeletonColumn}>
        <SkeletonLine width="68%" />
        <SkeletonLine height={12} width="44%" />
      </View>
    </View>
  );
}

function Section({
  title,
  action,
  children,
}: React.PropsWithChildren<{
  title: string;
  action?: React.ReactNode;
}>) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function StampDetailContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { accessToken, logout } = useAuth();
  const claims = useIdTokenClaims<IdClaims>();
  const queryClient = useQueryClient();
  const stampId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data: detail, error, isFetching, isPending, isPlaceholderData, refetch } =
    useStampDetailQuery(stampId);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isStamping, setIsStamping] = useState(false);
  const [isEditingVisits, setIsEditingVisits] = useState(false);
  const [visitDrafts, setVisitDrafts] = useState<Record<string, string>>({});
  const [busyVisitId, setBusyVisitId] = useState<string | null>(null);
  const [isImageCarouselVisible, setIsImageCarouselVisible] = useState(false);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const [zoomedImageId, setZoomedImageId] = useState<string | null>(null);
  const [carouselImageViewport, setCarouselImageViewport] = useState({ width: windowWidth, height: windowHeight });
  const carouselListRef = useRef<FlatList<CarouselImageItem> | null>(null);
  const lastCarouselTapRef = useRef<{ timestamp: number; imageId: string | null }>({
    timestamp: 0,
    imageId: null,
  });
  const carouselImagePan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const carouselImagePanOffsetRef = useRef({ x: 0, y: 0 });
  const [pickerState, setPickerState] = useState<{
    visitId: string;
    value: Date;
    mode: 'date' | 'time' | 'datetime';
  } | null>(null);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)' as never);
  }

  useEffect(() => {
    if (!detail) {
      return;
    }

    setVisitDrafts(
      Object.fromEntries(detail.myVisits.map((visit) => [visit.ID, getVisitTimestamp(visit) ?? '']))
    );
  }, [detail]);

  async function handleShare() {
    if (!detail) {
      return;
    }

    const deepLink = ExpoLinking.createURL(`/stamps/${detail.stamp.ID}`);

    await Share.share({
      message: `Stempel ${detail.stamp.number || '--'} • ${detail.stamp.name}\n${deepLink}`,
      url: deepLink,
      title: `Stempel ${detail.stamp.number || '--'} • ${detail.stamp.name}`,
    });
  }

  async function handleStartNavigation() {
    if (!detail?.stamp.latitude || !detail?.stamp.longitude) {
      Alert.alert('Navigation nicht moeglich', 'Diese Stempelstelle hat keine Koordinaten.');
      return;
    }

    const url = `https://www.google.com/maps/search/?api=1&query=${detail.stamp.latitude},${detail.stamp.longitude}`;
    await Linking.openURL(url);
  }

  function handleShowOnMap() {
    if (!detail?.stamp.ID) {
      return;
    }

    router.push({
      pathname: '/(tabs)/map',
      params: { stampId: detail.stamp.ID },
    } as never);
  }

  async function handleStampVisit() {
    if (!accessToken || !stampId || isStamping) {
      return;
    }

    setIsStamping(true);

    try {
      await createStamping(accessToken, stampId);
      await refetch();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.stampsOverview(claims?.sub) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mapData(claims?.sub) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profileOverview(claims?.sub) }),
      ]);
      Alert.alert('Besuch gespeichert', 'Die Stempelstelle wurde erfolgreich gestempelt.');
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
        await logout();
        return;
      }

      Alert.alert(
        'Stempeln fehlgeschlagen',
        nextError instanceof Error ? nextError.message : 'Unbekannter Fehler'
      );
    } finally {
      setIsStamping(false);
    }
  }

  async function handleDeleteVisit(stampingId: string) {
    if (!accessToken || busyVisitId) {
      return;
    }

    setBusyVisitId(stampingId);

    try {
      await deleteStamping(accessToken, stampingId);
      await refetch();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.stampsOverview(claims?.sub) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mapData(claims?.sub) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profileOverview(claims?.sub) }),
      ]);
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
        await logout();
        return;
      }

      Alert.alert(
        'Löschen fehlgeschlagen',
        nextError instanceof Error ? nextError.message : 'Unbekannter Fehler'
      );
    } finally {
      setBusyVisitId(null);
    }
  }

  function confirmDeleteVisit(stampingId: string) {
    Alert.alert(
      'Besuch löschen?',
      'Dieser Besuchseintrag wird dauerhaft entfernt.',
      [
        {
          text: 'Abbrechen',
          style: 'cancel',
        },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            void handleDeleteVisit(stampingId);
          },
        },
      ]
    );
  }

  async function persistVisitDate(stampingId: string, nextVisitedAt: string) {
    if (!accessToken || busyVisitId) {
      return;
    }

    const currentVisit = detail?.myVisits.find((visit) => visit.ID === stampingId);
    if (!currentVisit || nextVisitedAt === (getVisitTimestamp(currentVisit) ?? '')) {
      return;
    }

    try {
      setBusyVisitId(stampingId);
      setVisitDrafts((current) => ({
        ...current,
        [stampingId]: nextVisitedAt,
      }));
      await updateStamping(accessToken, stampingId, nextVisitedAt);
      await refetch();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.stampsOverview(claims?.sub) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mapData(claims?.sub) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profileOverview(claims?.sub) }),
      ]);
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
        await logout();
        return;
      }

      Alert.alert(
        'Speichern fehlgeschlagen',
        nextError instanceof Error ? nextError.message : 'Unbekannter Fehler'
      );
    } finally {
      setBusyVisitId(null);
    }
  }

  function handleToggleVisitEditing() {
    setIsEditingVisits((current) => !current);
  }

  function openVisitPicker(visitId: string, currentValue?: string) {
    const initial = currentValue ? new Date(currentValue) : new Date();
    setPickerState({
      visitId,
      value: Number.isNaN(initial.getTime()) ? new Date() : initial,
      mode: Platform.OS === 'ios' ? 'datetime' : 'date',
    });
  }

  function handlePickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (!pickerState) {
      return;
    }

    if (event.type === 'dismissed') {
      setPickerState(null);
      return;
    }

    const nextValue = selectedDate ?? pickerState.value;

    if (Platform.OS === 'ios') {
      setPickerState((current) => (current ? { ...current, value: nextValue } : null));
      return;
    }

    if (pickerState.mode === 'date') {
      setPickerState({
        visitId: pickerState.visitId,
        value: nextValue,
        mode: 'time',
      });
      return;
    }

    void persistVisitDate(pickerState.visitId, nextValue.toISOString());
    setPickerState(null);
  }

  function confirmIosPicker() {
    if (!pickerState) {
      return;
    }

    void persistVisitDate(pickerState.visitId, pickerState.value.toISOString());
    setPickerState(null);
  }

  const selectedStamp = detail?.stamp;
  const heroImageUri = selectedStamp?.heroImageUrl?.trim() || selectedStamp?.image?.trim() || '';
  const carouselImages = useMemo(() => {
    if (!detail || !selectedStamp) {
      return [] as CarouselImageItem[];
    }

    const items: CarouselImageItem[] = [];

    if (heroImageUri) {
      items.push({
        id: `stamp-${selectedStamp.ID}`,
        uri: heroImageUri,
        title: `${selectedStamp.number || '--'} • ${selectedStamp.name}`,
        kind: 'current',
        subtitle: 'Aktuelle Stempelstelle',
        imageCaption: selectedStamp.imageCaption?.trim() || undefined,
      });
    }

    for (const neighbor of detail.nearbyStamps) {
      const imageUri = neighbor.heroImageUrl?.trim();
      if (!imageUri) {
        continue;
      }

      items.push({
        id: `nearby-${neighbor.ID}`,
        uri: imageUri,
        title: `${neighbor.number || '--'} • ${neighbor.name}`,
        kind: 'nearby',
        subtitle: 'Stempel in der Naehe',
        imageCaption: neighbor.imageCaption?.trim() || undefined,
      });
    }

    const seenUris = new Set<string>();
    return items.filter((item) => {
      if (seenUris.has(item.uri)) {
        return false;
      }

      seenUris.add(item.uri);
      return true;
    });
  }, [detail, heroImageUri, selectedStamp]);

  const openImageCarousel = useCallback((startIndex = 0) => {
    if (carouselImages.length === 0) {
      return;
    }

    const nextIndex = Math.min(Math.max(0, startIndex), carouselImages.length - 1);
    setActiveCarouselIndex(nextIndex);
    setZoomedImageId(null);
    carouselImagePanOffsetRef.current = { x: 0, y: 0 };
    carouselImagePan.setValue({ x: 0, y: 0 });
    lastCarouselTapRef.current = { timestamp: 0, imageId: null };
    setIsImageCarouselVisible(true);
  }, [carouselImagePan, carouselImages.length]);

  const closeImageCarousel = useCallback(() => {
    setIsImageCarouselVisible(false);
    setActiveCarouselIndex(0);
    setZoomedImageId(null);
    carouselImagePanOffsetRef.current = { x: 0, y: 0 };
    carouselImagePan.setValue({ x: 0, y: 0 });
    lastCarouselTapRef.current = { timestamp: 0, imageId: null };
  }, [carouselImagePan]);

  const clampCarouselPan = useCallback((x: number, y: number) => {
    const viewportWidth = carouselImageViewport.width || windowWidth;
    const viewportHeight = carouselImageViewport.height || windowHeight;
    const maxX = (viewportWidth * (CAROUSEL_ZOOM_SCALE - 1)) / 2;
    const maxY = (viewportHeight * (CAROUSEL_ZOOM_SCALE - 1)) / 2;
    return {
      x: Math.min(Math.max(x, -maxX), maxX),
      y: Math.min(Math.max(y, -maxY), maxY),
    };
  }, [carouselImageViewport.height, carouselImageViewport.width, windowHeight, windowWidth]);

  const resetCarouselPan = useCallback(() => {
    carouselImagePanOffsetRef.current = { x: 0, y: 0 };
    carouselImagePan.setValue({ x: 0, y: 0 });
  }, [carouselImagePan]);

  const handleCarouselImageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) {
      return;
    }

    setCarouselImageViewport((current) => {
      if (Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5) {
        return current;
      }

      return { width, height };
    });
  }, []);

  const handleCarouselImagePress = useCallback((imageId: string, event: GestureResponderEvent) => {
    const tapX = event.nativeEvent.locationX;
    const tapY = event.nativeEvent.locationY;
    const now = Date.now();
    const previousTap = lastCarouselTapRef.current;
    const isDoubleTap =
      previousTap.imageId === imageId &&
      now - previousTap.timestamp <= CAROUSEL_DOUBLE_TAP_DELAY_MS;

    lastCarouselTapRef.current = { timestamp: now, imageId };

    if (!isDoubleTap) {
      return;
    }

    lastCarouselTapRef.current = { timestamp: 0, imageId: null };
    setZoomedImageId((current) => {
      if (current === imageId) {
        resetCarouselPan();
        return null;
      }

      const viewportWidth = carouselImageViewport.width || windowWidth;
      const viewportHeight = carouselImageViewport.height || windowHeight;
      const offsetFromCenterX = tapX - viewportWidth / 2;
      const offsetFromCenterY = tapY - viewportHeight / 2;
      const targetPan = clampCarouselPan(
        -(CAROUSEL_ZOOM_SCALE - 1) * offsetFromCenterX,
        -(CAROUSEL_ZOOM_SCALE - 1) * offsetFromCenterY
      );

      carouselImagePanOffsetRef.current = targetPan;
      carouselImagePan.setValue(targetPan);
      return imageId;
    });
  }, [
    carouselImagePan,
    carouselImageViewport.height,
    carouselImageViewport.width,
    clampCarouselPan,
    resetCarouselPan,
    windowHeight,
    windowWidth,
  ]);

  const carouselPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          zoomedImageId !== null &&
          (Math.abs(gestureState.dx) > CAROUSEL_PAN_THRESHOLD ||
            Math.abs(gestureState.dy) > CAROUSEL_PAN_THRESHOLD),
        onPanResponderMove: (_, gestureState) => {
          if (zoomedImageId === null) {
            return;
          }

          const next = clampCarouselPan(
            carouselImagePanOffsetRef.current.x + gestureState.dx,
            carouselImagePanOffsetRef.current.y + gestureState.dy
          );
          carouselImagePan.setValue(next);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (zoomedImageId === null) {
            return;
          }

          const next = clampCarouselPan(
            carouselImagePanOffsetRef.current.x + gestureState.dx,
            carouselImagePanOffsetRef.current.y + gestureState.dy
          );
          carouselImagePanOffsetRef.current = next;
          carouselImagePan.setValue(next);
        },
        onPanResponderTerminate: (_, gestureState) => {
          if (zoomedImageId === null) {
            return;
          }

          const next = clampCarouselPan(
            carouselImagePanOffsetRef.current.x + gestureState.dx,
            carouselImagePanOffsetRef.current.y + gestureState.dy
          );
          carouselImagePanOffsetRef.current = next;
          carouselImagePan.setValue(next);
        },
      }),
    [carouselImagePan, clampCarouselPan, zoomedImageId]
  );

  useEffect(() => {
    if (!isImageCarouselVisible) {
      return;
    }

    const nextIndex = Math.min(activeCarouselIndex, Math.max(0, carouselImages.length - 1));
    if (nextIndex !== activeCarouselIndex) {
      setActiveCarouselIndex(nextIndex);
      return;
    }

    requestAnimationFrame(() => {
      carouselListRef.current?.scrollToIndex({ animated: false, index: nextIndex });
    });
  }, [activeCarouselIndex, carouselImages.length, isImageCarouselVisible]);

  const handleCarouselScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (windowWidth <= 0) {
        return;
      }

      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / windowWidth);
      const boundedIndex = Math.min(Math.max(0, nextIndex), Math.max(0, carouselImages.length - 1));

      if (boundedIndex !== activeCarouselIndex) {
        setZoomedImageId(null);
        resetCarouselPan();
        lastCarouselTapRef.current = { timestamp: 0, imageId: null };
      }

      setActiveCarouselIndex(boundedIndex);
    },
    [activeCarouselIndex, carouselImages.length, resetCarouselPan, windowWidth]
  );

  if (!stampId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Ungültige Stempelstelle</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isPending && !detail) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#2e6b4b" size="large" />
          <Text style={styles.helperText}>Lade Details aus dem OData-v4-Service...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !detail) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Details konnten nicht geladen werden</Text>
          <Text style={styles.errorBody}>{error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Keine Detaildaten gefunden</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { stamp } = detail;
  const visited = !!stamp.hasVisited;
  const showDeferredSkeletons = isFetching && isPlaceholderData;
  const activeCarouselItem = carouselImages[activeCarouselIndex];
  const showNearbyCarouselPill =
    isImageCarouselVisible && activeCarouselItem?.kind === 'nearby';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <LinearGradient colors={heroGradient(visited)} style={styles.hero}>
          {heroImageUri ? (
            <>
              <Image
                contentFit="cover"
                source={buildAuthenticatedImageSource(heroImageUri, accessToken)}
                style={styles.heroImage}
              />
              <View style={styles.heroImageOverlay} />
            </>
          ) : null}
          {carouselImages.length > 0 ? (
            <Pressable
              onPress={() => openImageCarousel(0)}
              style={({ pressed }) => [
                styles.heroImagePressable,
                pressed && styles.heroImagePressablePressed,
              ]}
            />
          ) : null}
          <Pressable onPress={handleBack} style={({ pressed }) => [styles.topButton, pressed && styles.topButtonPressed]}>
            <Feather color="#1e2a1e" name="arrow-left" size={18} />
          </Pressable>

          <View style={styles.topRightActions}>
            <View style={[styles.statusPill, visited ? styles.statusPillVisited : styles.statusPillOpen]}>
              <Feather
                color={visited ? '#2e6b4b' : '#7a6a4a'}
                name={visited ? 'check' : 'x'}
                size={11}
              />
              <Text
                style={[
                  styles.statusPillLabel,
                  visited ? styles.statusPillLabelVisited : styles.statusPillLabelOpen,
                ]}>
                {visited ? 'Besucht' : 'Unbesucht'}
              </Text>
            </View>
            <Pressable onPress={handleShare} style={({ pressed }) => [styles.topButton, pressed && styles.topButtonPressed]}>
              <Feather color="#1e2a1e" name="share-2" size={18} />
            </Pressable>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Stempel {stamp.number || '--'}</Text>
          </View>
        </LinearGradient>
        {stamp.imageCaption?.trim() ? (
          <View style={styles.heroCaptionWrap}>
            <Markdown
              style={{
                body: styles.heroCaptionBody,
                paragraph: styles.heroCaptionParagraph,
                text: styles.heroCaptionBody,
                strong: styles.heroCaptionStrong,
                link: styles.heroCaptionLink,
              }}>
              {stamp.imageCaption.trim()}
            </Markdown>
          </View>
        ) : null}

        <View style={styles.body}>
          <Text style={styles.title}>{stamp.name}</Text>
          {stamp.description?.trim() ? (
            <Text style={styles.description}>{stamp.description.trim()}</Text>
          ) : showDeferredSkeletons ? (
            <View style={styles.descriptionSkeleton}>
              <SkeletonLine width="100%" />
              <SkeletonLine width="92%" />
              <SkeletonLine width="64%" />
            </View>
          ) : (
            <Text style={styles.description}>Keine Beschreibung fuer diese Stempelstelle verfuegbar.</Text>
          )}

          <Section title="Stempel in der Nähe">
            {showDeferredSkeletons ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : detail.nearbyStamps.length > 0 ? (
              detail.nearbyStamps.map((neighbor) => (
                <Pressable
                  key={neighbor.ID}
                  onPress={() => router.push(`/stamps/${neighbor.ID}` as never)}
                  style={({ pressed }) => [styles.rowItem, pressed && styles.rowItemPressed]}>
                  {neighbor.heroImageUrl ? (
                    <Image
                      contentFit="cover"
                      source={buildAuthenticatedImageSource(neighbor.heroImageUrl, accessToken)}
                      style={styles.rowArtwork}
                    />
                  ) : (
                    <View style={[styles.rowBadge, styles.rowBadgeStamp]}>
                      <Text style={[styles.rowBadgeLabel, styles.rowBadgeLabelStamp]}>{neighbor.number || '--'}</Text>
                    </View>
                  )}
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>
                      {neighbor.number || '--'} {'\u2022'} {neighbor.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatDistance(neighbor.distanceKm)}
                      {neighbor.durationMinutes ? ` • ${formatDuration(neighbor.durationMinutes)}` : ''}
                      {formatElevationSummary(neighbor.elevationGainMeters, neighbor.elevationLossMeters)}
                    </Text>
                  </View>
                  <Feather color="#8b957f" name="chevron-right" size={18} />
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyNearbyStampsState}>
                <Image
                  contentFit="contain"
                  source={emptyNearbyStampsIllustration}
                  style={styles.emptyNearbyStampsIllustration}
                />
                <Text style={[styles.emptySectionText, styles.emptyNearbyStampsText]}>
                  Keine Stempel in der Nähe gefunden.
                </Text>
              </View>
            )}
          </Section>

          <Section title="Parkplätze in der Nähe">
            {showDeferredSkeletons ? (
              <>
                <SkeletonLine width="86%" />
                <SkeletonLine width="78%" />
                <SkeletonLine width="82%" />
              </>
            ) : detail.nearbyParking.length > 0 ? (
              detail.nearbyParking.map((parking) => (
                <Pressable
                  key={parking.ID}
                  onPress={() => router.push(`/parking/${parking.ID}` as never)}
                  style={({ pressed }) => [styles.rowItem, pressed && styles.rowItemPressed]}>
                  <View style={[styles.rowBadge, styles.rowBadgeParking]}>
                    <Text style={[styles.rowBadgeLabel, styles.rowBadgeLabelParking]}>P</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{parking.name}</Text>
                    <Text style={styles.rowMeta}>
                      {formatDistance(parking.distanceKm)}
                      {parking.durationMinutes ? ` • ${formatDuration(parking.durationMinutes)}` : ''}
                      {formatElevationSummary(parking.elevationGainMeters, parking.elevationLossMeters)}
                    </Text>
                  </View>
                  <Feather color="#8b957f" name="chevron-right" size={18} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptySectionText}>Keine Parkplätze in der Nähe gefunden.</Text>
            )}
          </Section>

          <Section title="Freunde hier gewesen">
            {showDeferredSkeletons ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : detail.friendVisits.length > 0 ? (
              <FriendsList
                items={detail.friendVisits.map((visit) => ({
                  id: visit.id,
                  name: visit.name,
                  image: visit.picture,
                  subtitle: `Zuletzt besucht: ${formatVisitDate(visit.createdAt)}`,
                }))}
              />
            ) : (
              <Text style={styles.emptySectionText}>Noch keine Freundesbesuche fuer diese Stelle.</Text>
            )}
          </Section>

          <Section
            title="Meine bisherigen Besuche"
            action={
              detail.myVisits.length > 0 ? (
                <Pressable
                  disabled={!!busyVisitId}
                  onPress={handleToggleVisitEditing}
                  style={({ pressed }) => [
                    styles.sectionAction,
                    busyVisitId && styles.visitActionDisabled,
                    pressed && styles.sectionActionPressed,
                  ]}>
                  <Text style={styles.sectionActionLabel}>
                    {isEditingVisits ? 'Fertig' : 'Bearbeiten'}
                  </Text>
                </Pressable>
              ) : null
            }>
            {showDeferredSkeletons ? (
              <>
                <SkeletonLine width="72%" />
                <SkeletonLine width="58%" />
              </>
            ) : detail.myVisits.length > 0 ? (
              detail.myVisits.map((visit) => (
                <View key={visit.ID} style={styles.visitCard}>
                  {isEditingVisits ? (
                    <View style={styles.visitInlineRow}>
                      <Pressable
                        onPress={() => openVisitPicker(visit.ID, visitDrafts[visit.ID])}
                        style={({ pressed }) => [
                          styles.visitPickerButton,
                          pressed && styles.sectionActionPressed,
                        ]}>
                        <Text style={styles.visitPickerLabel}>
                          {visitDrafts[visit.ID]
                            ? formatEditableVisitDate(visitDrafts[visit.ID])
                            : 'Zeit waehlen'}
                        </Text>
                        <Feather color="#637062" name="calendar" size={16} />
                      </Pressable>
                      <Pressable
                        disabled={busyVisitId === visit.ID}
                        onPress={() => confirmDeleteVisit(visit.ID)}
                        style={({ pressed }) => [
                          styles.visitActionButton,
                          styles.visitDeleteButton,
                          styles.visitInlineAction,
                          pressed && busyVisitId !== visit.ID && styles.sectionActionPressed,
                          busyVisitId === visit.ID && styles.visitActionDisabled,
                        ]}>
                        <Text style={styles.visitDeleteLabel}>Löschen</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.simpleItemTitle}>
                      {formatVisitDate(getVisitTimestamp(visit))}
                    </Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptySectionText}>Du hast diese Stempelstelle noch nicht gestempelt.</Text>
            )}
          </Section>
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={styles.bottomDock}>
        <View style={styles.bottomActions}>
          <View style={styles.secondaryButtonRow}>
            <Pressable
              onPress={handleStartNavigation}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.secondaryButtonHalf,
                styles.secondaryButtonWithIcon,
                pressed && styles.secondaryButtonPressed,
              ]}>
              <Feather color="#2e3a2e" name="navigation" size={16} />
              <Text style={styles.secondaryButtonLabel}>Navigation starten</Text>
            </Pressable>
            <Pressable
              onPress={handleShowOnMap}
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.secondaryButtonHalf,
                styles.secondaryButtonWithIcon,
                pressed && styles.secondaryButtonPressed,
              ]}>
              <Feather color="#2e3a2e" name="map-pin" size={16} />
              <Text style={styles.secondaryButtonLabel}>Auf Karte anzeigen</Text>
            </Pressable>
          </View>
          <Pressable
            disabled={isStamping}
            onPress={handleStampVisit}
            style={({ pressed }) => [
              styles.primaryButton,
              styles.primaryButtonWithIcon,
              isStamping && styles.primaryButtonDisabled,
              pressed && !isStamping && styles.primaryButtonPressed,
            ]}>
            <Feather color="#f5f3ee" name={visited ? 'refresh-cw' : 'check-circle'} size={16} />
            <Text style={styles.primaryButtonLabel}>
              {isStamping
                ? 'Stemple...'
                : visited
                  ? 'Erneut stempeln'
                  : 'Besuch stempeln'}
            </Text>
          </Pressable>
        </View>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={closeImageCarousel}
        presentationStyle="fullScreen"
        statusBarTranslucent
        visible={isImageCarouselVisible}>
        <View style={styles.carouselScreen}>
          <FlatList
            data={carouselImages}
            getItemLayout={(_, index) => ({
              index,
              length: windowWidth,
              offset: windowWidth * index,
            })}
            horizontal
            initialNumToRender={1}
            keyExtractor={(item) => item.id}
            onMomentumScrollEnd={handleCarouselScrollEnd}
            pagingEnabled
            ref={carouselListRef}
            scrollEnabled={zoomedImageId === null}
            renderItem={({ item }) => (
              <View style={[styles.carouselSlide, { width: windowWidth }]}>
                <Pressable
                  onLayout={handleCarouselImageLayout}
                  onPress={(event) => handleCarouselImagePress(item.id, event)}
                  style={styles.carouselImagePressable}>
                  <Animated.View
                    style={[
                      styles.carouselImageTransform,
                      zoomedImageId === item.id
                        ? {
                            transform: [
                              { translateX: carouselImagePan.x },
                              { translateY: carouselImagePan.y },
                            ],
                          }
                        : undefined,
                    ]}
                    {...(zoomedImageId === item.id ? carouselPanResponder.panHandlers : {})}>
                    <Animated.View
                      style={[
                        styles.carouselImageScaleLayer,
                        zoomedImageId === item.id
                          ? { transform: [{ scale: CAROUSEL_ZOOM_SCALE }] }
                          : undefined,
                      ]}>
                      <Image
                        contentFit="contain"
                        source={buildAuthenticatedImageSource(item.uri, accessToken)}
                        style={styles.carouselImage}
                      />
                    </Animated.View>
                  </Animated.View>
                </Pressable>
                <View style={styles.carouselCaptionWrap}>
                  <Text style={styles.carouselCaptionTitle}>{item.title}</Text>
                  {item.subtitle ? (
                    <Text style={styles.carouselCaptionSubtitle}>{item.subtitle}</Text>
                  ) : null}
                  {item.imageCaption ? (
                    <Markdown
                      style={{
                        body: styles.carouselCaptionBody,
                        paragraph: styles.carouselCaptionParagraph,
                        text: styles.carouselCaptionBody,
                        strong: styles.carouselCaptionStrong,
                        link: styles.carouselCaptionLink,
                      }}>
                      {item.imageCaption}
                    </Markdown>
                  ) : null}
                </View>
              </View>
            )}
            showsHorizontalScrollIndicator={false}
          />

          <View style={[styles.carouselTopBar, { top: insets.top + 12 }]}>
            <Pressable
              hitSlop={14}
              onPress={closeImageCarousel}
              style={({ pressed }) => [styles.carouselCloseButton, pressed && styles.topButtonPressed]}>
              <Feather color="#f5f3ee" name="x" size={18} />
            </Pressable>
            {showNearbyCarouselPill ? (
              <View style={styles.carouselNearbyPill}>
                <Feather color="#2f7dd7" name="map-pin" size={12} />
                <Text style={styles.carouselNearbyPillLabel}>Stempel in der Nähe</Text>
              </View>
            ) : null}
            <Text style={styles.carouselCounterLabel}>
              {carouselImages.length > 0 ? `${activeCarouselIndex + 1} / ${carouselImages.length}` : '0 / 0'}
            </Text>
          </View>
        </View>
      </Modal>

      {pickerState && Platform.OS === 'ios' ? (
        <Modal animationType="slide" transparent visible>
          <View style={styles.modalScrim}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Besuchszeit wählen</Text>
              <DateTimePicker
                display="spinner"
                mode="datetime"
                onChange={handlePickerChange}
                textColor="#1e2a1e"
                themeVariant="light"
                value={pickerState.value}
              />
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setPickerState(null)}
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonSecondary,
                    pressed && styles.sectionActionPressed,
                  ]}>
                  <Text style={styles.modalButtonSecondaryLabel}>Abbrechen</Text>
                </Pressable>
                <Pressable
                  onPress={confirmIosPicker}
                  style={({ pressed }) => [
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    pressed && styles.sectionActionPressed,
                  ]}>
                  <Text style={styles.modalButtonPrimaryLabel}>Uebernehmen</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {pickerState && Platform.OS === 'android' ? (
        <DateTimePicker
          display="default"
          mode={pickerState.mode}
          onChange={handlePickerChange}
          value={pickerState.value}
        />
      ) : null}
    </SafeAreaView>
  );
}

export default function StampDetailScreen() {
  return (
    <AuthGuard>
      <StampDetailContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f3ee',
  },
  scrollContent: {
    paddingBottom: 180,
  },
  hero: {
    height: 240,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22, 28, 22, 0.22)',
  },
  heroImagePressable: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImagePressablePressed: {
    backgroundColor: 'rgba(245, 243, 238, 0.08)',
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(240,233,221,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topButtonPressed: {
    opacity: 0.88,
  },
  topRightActions: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  statusPill: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  statusPillVisited: {
    backgroundColor: '#e2eee6',
  },
  statusPillOpen: {
    backgroundColor: '#f0e9dd',
  },
  statusPillLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  statusPillLabelVisited: {
    color: '#2e6b4b',
  },
  statusPillLabelOpen: {
    color: '#7a6a4a',
  },
  heroBadge: {
    position: 'absolute',
    left: 20,
    bottom: 16,
    backgroundColor: '#f5f3ee',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: {
    color: '#1e2a1e',
    fontSize: 12,
    lineHeight: 16,
  },
  heroCaptionWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  heroCaptionBody: {
    color: '#5a675a',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  heroCaptionParagraph: {
    marginTop: 0,
    marginBottom: 4,
    textAlign: 'center',
  },
  heroCaptionStrong: {
    color: '#2e3a2e',
    fontWeight: '700',
  },
  heroCaptionLink: {
    color: '#2f7dd7',
    textDecorationLine: 'underline',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  descriptionSkeleton: {
    gap: 8,
  },
  title: {
    color: '#1e2a1e',
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'serif',
  },
  description: {
    color: '#445244',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
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
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: '#1e2a1e',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  sectionAction: {
    borderRadius: 999,
    backgroundColor: '#eef4ef',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectionActionPressed: {
    opacity: 0.82,
  },
  sectionActionLabel: {
    color: '#2e6b4b',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowItemPressed: {
    opacity: 0.85,
  },
  rowBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowArtwork: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  rowBadgeStamp: {
    backgroundColor: '#e2eee6',
  },
  rowBadgeParking: {
    backgroundColor: '#e3effc',
  },
  rowBadgeLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowBadgeLabelStamp: {
    color: '#2e6b4b',
  },
  rowBadgeLabelParking: {
    color: '#2f7dd7',
    fontWeight: '700',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: '#111111',
    fontSize: 13,
    lineHeight: 16,
  },
  rowMeta: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  simpleItem: {
    gap: 2,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skeletonBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ece6db',
  },
  skeletonColumn: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    borderRadius: 999,
    backgroundColor: '#ece6db',
  },
  visitCard: {
    gap: 8,
  },
  visitInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  visitPickerButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#f5f3ee',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visitPickerLabel: {
    color: '#1e2a1e',
    fontSize: 13,
    lineHeight: 16,
  },
  visitActionButton: {
    minHeight: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  visitInlineAction: {
    flexShrink: 0,
  },
  visitDeleteButton: {
    backgroundColor: '#efe6d8',
  },
  visitActionDisabled: {
    opacity: 0.5,
  },
  visitDeleteLabel: {
    color: '#6f5e40',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  simpleItemTitle: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  emptySectionText: {
    color: '#6b7a6b',
    fontSize: 12,
    lineHeight: 16,
  },
  emptyNearbyStampsState: {
    alignItems: 'center',
    gap: 8,
  },
  emptyNearbyStampsIllustration: {
    width: 120,
    height: 120,
  },
  emptyNearbyStampsText: {
    textAlign: 'center',
  },
  bottomDock: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
  },
  bottomActions: {
    gap: 8,
  },
  secondaryButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    height: 45,
    borderRadius: 14,
    backgroundColor: '#e9e2d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonHalf: {
    flex: 1,
  },
  secondaryButtonWithIcon: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
  },
  secondaryButtonPressed: {
    opacity: 0.9,
  },
  secondaryButtonLabel: {
    color: '#2e3a2e',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  primaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#2e6b4b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonWithIcon: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: {
    backgroundColor: '#7aa287',
  },
  primaryButtonPressed: {
    opacity: 0.92,
  },
  primaryButtonLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  carouselScreen: {
    flex: 1,
    backgroundColor: '#0f1310',
  },
  carouselTopBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
    elevation: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  carouselCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(29, 38, 31, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselCounterLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(29, 38, 31, 0.88)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  carouselNearbyPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(227, 239, 252, 0.98)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carouselNearbyPillLabel: {
    color: '#2f7dd7',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  carouselSlide: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 68,
    paddingBottom: 30,
  },
  carouselImage: {
    flex: 1,
    width: '100%',
  },
  carouselImagePressable: {
    flex: 1,
    width: '100%',
  },
  carouselImageTransform: {
    flex: 1,
    width: '100%',
  },
  carouselImageScaleLayer: {
    flex: 1,
    width: '100%',
  },
  carouselCaptionWrap: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 6,
  },
  carouselCaptionTitle: {
    color: '#f5f3ee',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  carouselCaptionSubtitle: {
    color: '#ccd5cb',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 4,
  },
  carouselCaptionBody: {
    color: '#e6ede4',
    fontSize: 13,
    lineHeight: 18,
  },
  carouselCaptionParagraph: {
    marginTop: 2,
    marginBottom: 6,
    textAlign: 'center',
  },
  carouselCaptionStrong: {
    color: '#f5f3ee',
    fontWeight: '700',
  },
  carouselCaptionLink: {
    color: '#b4d6ff',
    textDecorationLine: 'underline',
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(20, 30, 20, 0.26)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fffaf0',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 12,
  },
  modalTitle: {
    color: '#1e2a1e',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#2e6b4b',
  },
  modalButtonSecondary: {
    backgroundColor: '#e9e2d6',
  },
  modalButtonPrimaryLabel: {
    color: '#f5f3ee',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
  modalButtonSecondaryLabel: {
    color: '#2e3a2e',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  helperText: {
    color: '#496149',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#3d2a15',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorBody: {
    color: '#655d4a',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
