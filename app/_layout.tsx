import config from "@/auth0-config";
import { useColorScheme } from "@/hooks/useColorScheme";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React from 'react';
import { Auth0Provider } from "react-native-auth0";
import "react-native-reanimated";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    // add the auth0 provider
    // the domain and clientId come from your auth0 account. I have made a separate
    // config file to pull this information from, you don't have to.
    <Auth0Provider domain={config.domain} clientId={config.clientId}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* add this authorisation stack screen, it won't lead to anything at 
              the moment but we will set it up */}
          <Stack.Screen
            name="authorisation"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
      </ThemeProvider>
    </Auth0Provider>
  );
}