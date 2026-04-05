import {
  focusManager,
  useQueryClient,
} from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { clearPersistedQueryCache, queryPersistOptions } from '@/lib/query-persistence';
import { queryClient } from '@/lib/query-client';

function QueryFocusBridge() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}

function QueryAuthBridge() {
  const queryClient = useQueryClient();
  const { accessToken, isAuthenticated, isLoading } = useAuth();
  const hasBeenAuthenticatedRef = useRef(false);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const isCurrentlyAuthenticated = Boolean(accessToken && isAuthenticated);

    if (!isCurrentlyAuthenticated) {
      if (hasBeenAuthenticatedRef.current || queryClient.getQueryCache().getAll().length > 0) {
        queryClient.clear();
        void clearPersistedQueryCache();
      }
      hasBeenAuthenticatedRef.current = false;
      return;
    }

    if (isCurrentlyAuthenticated) {
      hasBeenAuthenticatedRef.current = true;
    }
  }, [accessToken, isAuthenticated, isLoading, queryClient]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={queryPersistOptions}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="profile/edit" />
              <Stack.Screen name="profile/[userId]" />
              <Stack.Screen name="tours/[id]/index" />
              <Stack.Screen name="tours/[id]/edit" />
              <Stack.Screen name="stamps/[id]" />
              <Stack.Screen name="parking/[id]" />
            </Stack>
            <StatusBar style="light" />
          </ThemeProvider>
          <QueryFocusBridge />
          <QueryAuthBridge />
        </AuthProvider>
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
  );
}
