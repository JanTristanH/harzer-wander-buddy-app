import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthGuard } from '@/components/auth-guard';

function ProfileEditContent() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Feather color="#1e2a1e" name="arrow-left" size={18} />
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.title}>Profil bearbeiten</Text>
          <Text style={styles.copy}>
            Dieser Screen ist als Platzhalter vorbereitet. Die echte Profilbearbeitung folgt in
            einem naechsten Schritt.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function ProfileEditScreen() {
  return (
    <AuthGuard>
      <ProfileEditContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f3ee',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f0e9dd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.84,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
    shadowColor: '#141e14',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  title: {
    color: '#1e2a1e',
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'serif',
  },
  copy: {
    color: '#5f6e5f',
    fontSize: 14,
    lineHeight: 22,
  },
});
