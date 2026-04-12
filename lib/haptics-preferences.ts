import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

export type HapticStrength = 'off' | 'light' | 'medium' | 'strong';
export type HapticEvent = 'poiAdded' | 'tabChange';

const HAPTIC_STRENGTH_STORAGE_KEY = '@hwb:haptic-strength';
export const DEFAULT_HAPTIC_STRENGTH: HapticStrength = 'medium';

let cachedStrength: HapticStrength = DEFAULT_HAPTIC_STRENGTH;
let hasLoadedStrength = false;
let loadStrengthPromise: Promise<HapticStrength> | null = null;

function isHapticStrength(value: string): value is HapticStrength {
  return value === 'off' || value === 'light' || value === 'medium' || value === 'strong';
}

export function getCachedHapticStrength() {
  return cachedStrength;
}

export async function loadHapticStrengthPreference() {
  if (hasLoadedStrength) {
    return cachedStrength;
  }

  if (loadStrengthPromise) {
    return loadStrengthPromise;
  }

  loadStrengthPromise = (async () => {
    try {
      const rawValue = await AsyncStorage.getItem(HAPTIC_STRENGTH_STORAGE_KEY);
      if (rawValue && isHapticStrength(rawValue)) {
        cachedStrength = rawValue;
      } else {
        cachedStrength = DEFAULT_HAPTIC_STRENGTH;
      }
    } catch {
      cachedStrength = DEFAULT_HAPTIC_STRENGTH;
    } finally {
      hasLoadedStrength = true;
      loadStrengthPromise = null;
    }

    return cachedStrength;
  })();

  return loadStrengthPromise;
}

export async function setHapticStrengthPreference(strength: HapticStrength) {
  cachedStrength = strength;
  hasLoadedStrength = true;
  await AsyncStorage.setItem(HAPTIC_STRENGTH_STORAGE_KEY, strength);
}

export async function triggerHaptic(event: HapticEvent) {
  const strength = await loadHapticStrengthPreference();

  if (strength === 'off') {
    return;
  }

  if (event === 'poiAdded') {
    if (strength === 'light') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    if (strength === 'medium') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return;
  }

  if (strength === 'light') {
    await Haptics.selectionAsync();
    return;
  }

  if (strength === 'medium') {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return;
  }

  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}
