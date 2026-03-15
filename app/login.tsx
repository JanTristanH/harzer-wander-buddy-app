import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
  type PressableProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { createFriendRequest, searchUsers, type SearchUserResult } from '@/lib/api';
import { useAuth, useIdTokenClaims } from '@/lib/auth';

const bearIllustration = require('@/assets/images/onboarding-bear.png');

type LoginClaims = {
  given_name?: string;
  name?: string;
  nickname?: string;
};

type ActionButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary';
};

type LocationPermissionState = 'unknown' | 'checking' | 'granted' | 'denied';

const AVATAR_COLORS = ['#DDE9DF', '#EADFCB', '#D7E2EC', '#E6D9E9'];

function ActionButton({
  label,
  variant = 'secondary',
  disabled,
  style,
  ...props
}: ActionButtonProps) {
  const resolveStyle = (state: PressableStateCallbackType) =>
    typeof style === 'function' ? style(state) : style;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={(state) => [
        styles.actionButton,
        variant === 'primary' ? styles.actionButtonPrimary : styles.actionButtonSecondary,
        disabled && styles.actionButtonDisabled,
        state.pressed && !disabled && styles.actionButtonPressed,
        resolveStyle(state),
      ]}
      {...props}>
      <Text
        style={[
          styles.actionButtonLabel,
          variant === 'primary' ? styles.actionButtonLabelPrimary : styles.actionButtonLabelSecondary,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SearchResultRow({
  result,
  index,
  status,
  disabled,
  onPress,
}: {
  result: SearchUserResult;
  index: number;
  status: 'request' | 'sent' | 'friend';
  disabled: boolean;
  onPress: () => void;
}) {
  const actionLabel = status === 'sent' ? 'Gesendet' : status === 'friend' ? 'Verbunden' : 'Anfrage';

  return (
    <View style={styles.searchResultRow}>
      <View style={styles.searchResultBody}>
        <View
          style={[
            styles.searchAvatar,
            { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] },
          ]}
        />
        <View style={styles.searchResultText}>
          <Text style={styles.searchResultName}>{result.name}</Text>
          <Text style={styles.searchResultMeta}>@{result.id}</Text>
        </View>
      </View>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.searchActionButton,
          status !== 'request' && styles.searchActionButtonMuted,
          disabled && styles.actionButtonDisabled,
          pressed && styles.actionButtonPressed,
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

export default function LoginScreen() {
  const router = useRouter();
  const { accessToken, authError, configError, isAuthenticated, login, signup, isLoading, logout } =
    useAuth();
  const claims = useIdTokenClaims<LoginClaims>();
  const [locationPermission, setLocationPermission] = useState<LocationPermissionState>('unknown');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [submittingUserId, setSubmittingUserId] = useState<string | null>(null);
  const [sentRequestIds, setSentRequestIds] = useState<string[]>([]);
  const primaryDisabled = !isAuthenticated || !!configError || isLoading;
  const errorMessage = configError || authError;
  const displayName = claims?.nickname || claims?.name || claims?.given_name || 'Wanderbuddy';
  const footerNote = isAuthenticated
    ? 'Du kannst alles später in den Einstellungen ändern.'
    : 'Anmelden erforderlich';
  const locationButtonLabel =
    locationPermission === 'checking'
      ? 'Prüfen...'
      : locationPermission === 'granted'
        ? 'Erlaubt'
        : locationPermission === 'denied'
          ? 'Erneut fragen'
          : 'Erlauben';
  const locationDescription =
    locationPermission === 'granted'
      ? 'Standortfreigabe ist aktiv fuer Entfernungen, Karte und nahe Parkplaetze.'
      : 'Fuer Entfernungen, Karte und nahe Parkplaetze.';
  const sentRequestIdSet = useMemo(() => new Set(sentRequestIds), [sentRequestIds]);

  const closeSearchModal = useCallback(() => {
    setIsSearchModalVisible(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setIsSearchLoading(false);
    setSubmittingUserId(null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadLocationPermission() {
      try {
        const status = await Location.getForegroundPermissionsAsync();
        if (!isMounted) {
          return;
        }

        setLocationPermission(status.granted ? 'granted' : status.status === 'denied' ? 'denied' : 'unknown');
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setLocationError(
          error instanceof Error ? error.message : 'Standortberechtigung konnte nicht gelesen werden.'
        );
      }
    }

    void loadLocationPermission();

    return () => {
      isMounted = false;
    };
  }, []);

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
        } catch (error) {
          if (cancelled) {
            return;
          }

          if (error instanceof Error && error.name === 'UnauthorizedError') {
            await logout();
            return;
          }

          setSearchError(error instanceof Error ? error.message : 'Unknown error');
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
  }, [accessToken, isSearchModalVisible, logout, searchQuery]);

  const handleCreateRequest = useCallback(
    async (userId: string) => {
      if (!accessToken) {
        return;
      }

      setSubmittingUserId(userId);

      try {
        await createFriendRequest(accessToken, userId);
        setSentRequestIds((current) => (current.includes(userId) ? current : [...current, userId]));
      } catch (error) {
        if (error instanceof Error && error.name === 'UnauthorizedError') {
          await logout();
          return;
        }

        Alert.alert(
          'Anfrage konnte nicht gesendet werden',
          error instanceof Error ? error.message : 'Unknown error'
        );
      } finally {
        setSubmittingUserId(null);
      }
    },
    [accessToken, logout]
  );

  async function requestLocationPermission() {
    setLocationError(null);
    setLocationPermission('checking');

    try {
      const result = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(result.granted ? 'granted' : result.status === 'denied' ? 'denied' : 'unknown');
    } catch (error) {
      setLocationPermission('unknown');
      setLocationError(
        error instanceof Error ? error.message : 'Standortberechtigung konnte nicht angefragt werden.'
      );
    }
  }

  return (
    <LinearGradient colors={['#f7f5ef', '#f3efe6', '#f0ebe1']} style={styles.gradient}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <Text style={styles.eyebrow}>Erste Schritte</Text>

          <View style={styles.heroRow}>
            <Text style={styles.title}>Mach die App zu deinem Wanderbuddy</Text>
            <Image contentFit="contain" source={bearIllustration} style={styles.heroImage} />
          </View>

          <Text style={styles.copy}>
            Wir fragen nur nach dem, was dir wirklich hilft: Standort für die Karte und
            Benachrichtigungen für neue Stempelstellen.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Konto</Text>
            <Text style={styles.cardCopy}>
              {isAuthenticated
                ? 'Du bist angemeldet und kannst jetzt direkt loslegen.'
                : 'Anmelden ist erforderlich, um Stempel zu speichern.'}
            </Text>
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            {isAuthenticated ? (
              <View style={styles.welcomeBox}>
                <Text style={styles.welcomeEyebrow}>Willkommen</Text>
                <Text style={styles.welcomeName}>{displayName}</Text>
              </View>
            ) : (
              <View style={styles.row}>
                <ActionButton
                  disabled={!!configError || isLoading}
                  label={isLoading ? 'Wird vorbereitet...' : 'Anmelden'}
                  onPress={login}
                />
                <ActionButton
                  disabled={!!configError || isLoading}
                  label={isLoading ? 'Wird vorbereitet...' : 'Konto erstellen'}
                  onPress={signup}
                  variant="primary"
                />
              </View>
            )}
          </View>

          <View style={[styles.card, styles.inlineCard]}>
            <View
              style={[
                styles.permissionIcon,
                locationPermission === 'granted' && styles.permissionIconGranted,
              ]}
            />
            <View style={styles.permissionBody}>
              <Text style={styles.cardTitle}>Standort erlauben</Text>
              <Text style={styles.cardCopy}>{locationDescription}</Text>
              {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
            </View>
            <ActionButton
              disabled={
                locationPermission === 'checking' || locationPermission === 'granted'
              }
              label={locationButtonLabel}
              onPress={requestLocationPermission}
              style={[
                styles.inlineAction,
                locationPermission === 'granted' && styles.inlineActionGranted,
              ]}
              variant={locationPermission === 'granted' ? 'primary' : 'secondary'}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hast du schon Wanderbuddies?</Text>
            <Text style={styles.cardCopy}>
              Suche direkt nach Freunden und sende schon waehrend des Onboardings Anfragen.
            </Text>
            <ActionButton
              disabled={!isAuthenticated || !accessToken}
              label="Freunde hinzufügen"
              onPress={() => setIsSearchModalVisible(true)}
              style={styles.fullWidthButton}
            />
          </View>
        </ScrollView>

        <View pointerEvents="box-none" style={styles.bottomDock}>
          <View style={styles.bottomSection}>
            <ActionButton
              disabled={primaryDisabled}
              label="Zu den Stempelstellen"
              onPress={() => router.replace('/(tabs)')}
              style={[styles.bottomButton, primaryDisabled && styles.bottomButtonDisabled]}
              variant="primary"
            />
            <Text style={styles.footerNote}>{footerNote}</Text>
          </View>
        </View>

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
                  style={({ pressed }) => [styles.modalCloseButton, pressed && styles.actionButtonPressed]}>
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
                      const status: 'request' | 'sent' | 'friend' =
                        result.isFriend || sentRequestIdSet.has(result.id) ? (result.isFriend ? 'friend' : 'sent') : 'request';

                      return (
                        <SearchResultRow
                          key={result.id}
                          disabled={status !== 'request' || submittingUserId === result.id}
                          index={index}
                          onPress={() => void handleCreateRequest(result.id)}
                          result={result}
                          status={status === 'request' && submittingUserId === result.id ? 'sent' : status}
                        />
                      );
                    })
                  : null}
              </View>

              <View style={styles.modalHint}>
                <Text style={styles.modalHintText}>
                  Profile kannst du nach dem Onboarding in der Freunde-Ansicht oeffnen.
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 180,
    minHeight: '100%',
  },
  eyebrow: {
    color: '#61705f',
    fontSize: 12,
    letterSpacing: 2.2,
    lineHeight: 16,
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    flex: 1,
    color: '#11100d',
    fontSize: 26,
    lineHeight: 38,
    fontFamily: 'serif',
    maxWidth: 190,
  },
  heroImage: {
    width: 148,
    height: 152,
    marginRight: -4,
    marginTop: -8,
  },
  copy: {
    color: '#5a6655',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 24,
    maxWidth: 332,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 18,
    gap: 12,
    shadowColor: '#bda981',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 5,
    marginBottom: 18,
  },
  inlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardTitle: {
    color: '#263127',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  cardCopy: {
    color: '#778177',
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: '#8a2d1f',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -2,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  welcomeBox: {
    backgroundColor: '#edf4ef',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  welcomeEyebrow: {
    color: '#5f7464',
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  welcomeName: {
    color: '#263127',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
  },
  actionButton: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  actionButtonPrimary: {
    backgroundColor: '#397b52',
  },
  actionButtonSecondary: {
    backgroundColor: '#e8dfcf',
  },
  actionButtonDisabled: {
    opacity: 0.48,
  },
  actionButtonPressed: {
    opacity: 0.88,
  },
  actionButtonLabel: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '500',
  },
  actionButtonLabelPrimary: {
    color: '#f5f3ee',
  },
  actionButtonLabelSecondary: {
    color: '#374337',
  },
  permissionIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#dce8df',
  },
  permissionIconGranted: {
    backgroundColor: '#c9decf',
  },
  permissionBody: {
    flex: 1,
    gap: 4,
  },
  inlineAction: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 104,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  inlineActionGranted: {
    backgroundColor: '#397b52',
  },
  fullWidthButton: {
    width: '100%',
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
  searchResultBody: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  searchAvatar: {
    borderRadius: 12,
    height: 40,
    width: 40,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultName: {
    color: '#1E2A1E',
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 2,
  },
  searchResultMeta: {
    color: '#6B7A6B',
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
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
  modalHint: {
    backgroundColor: '#F8F6F1',
    borderRadius: 14,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  modalHintText: {
    color: '#6B7A6B',
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  bottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingBottom: 10,
  },
  bottomSection: {
    backgroundColor: 'rgba(247, 245, 239, 0.92)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    gap: 14,
  },
  bottomButton: {
    width: '100%',
    minHeight: 58,
    borderRadius: 22,
  },
  bottomButtonDisabled: {
    backgroundColor: '#d7d3cb',
  },
  footerNote: {
    color: '#798275',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
});
