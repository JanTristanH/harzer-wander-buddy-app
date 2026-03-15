import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';

export function AuthGuard({ children }: React.PropsWithChildren) {
  const { configError, hasCompletedOnboarding, isAuthenticated, isLoading } = useAuth();

  if (configError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.eyebrow}>Configuration</Text>
        <Text style={styles.errorText}>{configError}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#155e63" />
        <Text style={styles.loadingText}>Restoring your session…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href={(hasCompletedOnboarding ? '/login' : '/onboarding') as never} />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#f4efe4',
    gap: 10,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#7a5f34',
    fontWeight: '700',
  },
  errorText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: '#3d2a15',
  },
  loadingText: {
    fontSize: 16,
    color: '#155e63',
  },
});
