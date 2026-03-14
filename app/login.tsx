import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const { authError, configError, isAuthenticated, login, isLoading } = useAuth();

  if (isAuthenticated) {
    return <Redirect href={'/(tabs)' as never} />;
  }

  return (
    <LinearGradient colors={['#184f59', '#7a5f34', '#f4efe4']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Harzer Wander Buddy</Text>
          <Text style={styles.title}>Mobile stamp collection, authenticated against your CAP backend.</Text>
          <Text style={styles.copy}>
            Sign in with Auth0 to load all Harzer Wandernadel stamps from the OData v4 service.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Native Auth0 Login</Text>
          <Text style={styles.panelCopy}>
            This build expects a dedicated Auth0 native app, PKCE enabled, and the Expo redirect URI
            registered in Auth0.
          </Text>

          {configError ? <Text style={styles.error}>{configError}</Text> : null}
          {authError ? <Text style={styles.error}>{authError}</Text> : null}

          <Pressable
            disabled={!!configError || isLoading}
            onPress={login}
            style={({ pressed }) => [
              styles.button,
              (pressed || !!configError || isLoading) && styles.buttonDisabled,
            ]}>
            <Text style={styles.buttonText}>{isLoading ? 'Restoring…' : 'Continue with Auth0'}</Text>
          </Pressable>
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
    paddingHorizontal: 24,
    paddingVertical: 18,
    justifyContent: 'space-between',
  },
  hero: {
    gap: 14,
    paddingTop: 24,
  },
  eyebrow: {
    color: '#f1dfb8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff8e7',
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    maxWidth: 320,
  },
  copy: {
    color: '#f7f2e8',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 340,
  },
  panel: {
    backgroundColor: 'rgba(255, 250, 240, 0.94)',
    borderRadius: 28,
    padding: 22,
    gap: 12,
    marginBottom: 10,
  },
  panelTitle: {
    color: '#184f59',
    fontSize: 22,
    fontWeight: '800',
  },
  panelCopy: {
    color: '#564f3c',
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    color: '#8a2d1f',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#184f59',
    borderRadius: 18,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#fff8e7',
    fontSize: 16,
    fontWeight: '800',
  },
});
