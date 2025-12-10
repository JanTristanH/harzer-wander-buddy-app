// lib/storage.ts
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Type that matches what ExpoClientOptions expects
type ExpoStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => any;
  removeItem?: (key: string) => any;
};

function createStorage(): ExpoStorage {
  if (Platform.OS === "web") {
    // Web: use localStorage (sync)
    return {
      getItem(key: string): string | null {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(key);
      },
      setItem(key: string, value: string): void {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(key, value);
      },
      removeItem(key: string): void {
        if (typeof window === "undefined") return;
        window.localStorage.removeItem(key);
      },
    };
  }

  // Native: let Better Auth use expo-secure-store
  // We just force-cast to match the expected sync type – internally
  // the Expo plugin knows how to deal with SecureStore.
  return SecureStore as unknown as ExpoStorage;
}

export const storage = createStorage();
