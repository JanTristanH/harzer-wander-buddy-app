import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth, useIdTokenClaims } from '@/lib/auth';
import { appConfig } from '@/lib/config';

type ProfileClaims = {
  email?: string;
  name?: string;
  sub?: string;
};

export default function ProfileScreen() {
  const { logout } = useAuth();
  const claims = useIdTokenClaims<ProfileClaims>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Session</Text>
        <Text style={styles.title}>{claims?.name || claims?.email || 'Authenticated user'}</Text>
        <Text style={styles.subtitle}>{claims?.sub || 'No subject claim available.'}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.label}>Backend</Text>
        <Text style={styles.value}>{appConfig.backendUrl || 'Missing backend URL'}</Text>

        <Text style={styles.label}>Audience</Text>
        <Text style={styles.value}>{appConfig.auth0Audience || 'Missing audience'}</Text>

        <Pressable onPress={logout} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4efe4',
    paddingHorizontal: 20,
    gap: 18,
  },
  hero: {
    backgroundColor: '#7a5f34',
    borderRadius: 28,
    padding: 22,
    gap: 8,
  },
  eyebrow: {
    color: '#f1dfb8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff8e7',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#f5ecda',
    fontSize: 13,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: '#fffaf0',
    borderRadius: 28,
    padding: 22,
    gap: 8,
    borderWidth: 1,
    borderColor: '#ead9b6',
  },
  label: {
    color: '#7a5f34',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 10,
  },
  value: {
    color: '#2b312d',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#184f59',
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff8e7',
    fontSize: 16,
    fontWeight: '800',
  },
});
