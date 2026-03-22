import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPress={(ev) => {
        if (!props.accessibilityState?.selected) {
          // Give subtle feedback only when changing to a different tab.
          Haptics.selectionAsync();
        }
        props.onPress?.(ev);
      }}
    />
  );
}
