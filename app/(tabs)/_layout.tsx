import { Tabs } from 'expo-router';
import React from 'react';

import { AuthGuard } from '@/components/auth-guard';
import { FloatingBarIcon } from '@/components/floating-bar-icon';
import { HapticTab } from '@/components/haptic-tab';

export default function TabLayout() {
  return (
    <AuthGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarActiveTintColor: '#2e6b4b',
          tabBarInactiveTintColor: '#718071',
          tabBarStyle: {
            backgroundColor: '#ffffff',
            borderTopWidth: 0,
            height: 80,
            paddingTop: 8,
            paddingBottom: 12,
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
