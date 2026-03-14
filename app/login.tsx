import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type PressableProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export default function LoginScreen() {
  const router = useRouter();
  const { authError, configError, isAuthenticated, login, signup, isLoading } = useAuth();
  const claims = useIdTokenClaims<LoginClaims>();
  const primaryDisabled = !isAuthenticated || !!configError || isLoading;
  const errorMessage = configError || authError;
  const displayName = claims?.nickname || claims?.name || claims?.given_name || 'Wanderbuddy';
  const footerNote = isAuthenticated
    ? 'Du kannst alles spaeter in den Einstellungen aendern.'
    : 'Anmelden erforderlich';

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
            <View style={styles.permissionIcon} />
            <View style={styles.permissionBody}>
              <Text style={styles.cardTitle}>Standort erlauben</Text>
              <Text style={styles.cardCopy}>
                Für Entfernungen, Karte und nahe Parkplätze.
              </Text>
            </View>
            <ActionButton disabled label="Erlauben" style={styles.inlineAction} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hast du schon Wanderbuddies?</Text>
            <ActionButton disabled label="Freunde Hinzufügen" style={styles.fullWidthButton} />
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
  fullWidthButton: {
    width: '100%',
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
