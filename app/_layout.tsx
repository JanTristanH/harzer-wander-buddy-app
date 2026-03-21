import {
  QueryClientProvider,
  focusManager,
  useQueryClient,
} from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth';
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
  const { accessToken, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!accessToken || !isAuthenticated) {
      queryClient.clear();
    }
  }, [accessToken, isAuthenticated, queryClient]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="profile/edit" />
            <Stack.Screen name="profile/[userId]" />
            <Stack.Screen name="stamps/[id]" />
            <Stack.Screen name="parking/[id]" />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
        <QueryFocusBridge />
        <QueryAuthBridge />
      </AuthProvider>
    </QueryClientProvider>
  );
}
