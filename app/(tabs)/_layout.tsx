import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React from 'react';
import { Easing, useWindowDimensions } from 'react-native';

import { AuthGuard } from '@/components/auth-guard';
import { FloatingBarIcon } from '@/components/floating-bar-icon';
import { HapticTab } from '@/components/haptic-tab';

const getHorizontalSwipeInterpolator = (
  width: number
): BottomTabNavigationOptions['sceneStyleInterpolator'] => {
  return ({ current }) => ({
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, -0.4, 0, 0.4, 1],
        outputRange: [0.9, 0.96, 1, 0.96, 0.9],
      }),
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-width, 0, width],
          }),
        },
      ],
    },
  });
};

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const sceneStyleInterpolator = React.useMemo(
    () => getHorizontalSwipeInterpolator(Math.max(width, 1)),
    [width]
  );

  return (
    <AuthGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyleInterpolator,
          transitionSpec: {
            animation: 'timing',
            config: {
              duration: 260,
              easing: Easing.out(Easing.cubic),
            },
          },
          tabBarButton: HapticTab,
          tabBarActiveTintColor: '#2e6b4b',
          tabBarInactiveTintColor: '#718071',
          tabBarStyle: {
            backgroundColor: '#ffffff',
            borderTopWidth: 0,
            height: 72,
            paddingTop: 6,
            paddingBottom: 6,
            marginHorizontal: 20,
            marginBottom: 20,
            borderRadius: 24,
            position: 'absolute',
            shadowColor: '#141e14',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 18,
            elevation: 6,
          },
          tabBarLabelStyle: {
            fontWeight: '700',
            fontSize: 11,
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Liste',
            tabBarIcon: ({ color, focused }) => (
              <FloatingBarIcon color={color} focused={focused} name="index" size={28} />
            ),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'Karte',
            tabBarIcon: ({ color, focused }) => (
              <FloatingBarIcon color={color} focused={focused} name="map" size={28} />
            ),
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: 'Freunde',
            tabBarIcon: ({ color, focused }) => (
              <FloatingBarIcon color={color} focused={focused} name="friends" size={28} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ color, focused }) => (
              <FloatingBarIcon color={color} focused={focused} name="profile" size={28} />
            ),
          }}
        />
      </Tabs>
    </AuthGuard>
  );
}
