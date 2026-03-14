import { Tabs } from 'expo-router';
import React from 'react';

import { AuthGuard } from '@/components/auth-guard';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
  return (
    <AuthGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarActiveTintColor: '#184f59',
          tabBarInactiveTintColor: '#836c44',
          tabBarStyle: {
            backgroundColor: '#fffaf0',
            borderTopColor: '#ead9b6',
            height: 84,
            paddingTop: 8,
            paddingBottom: 12,
          },
          tabBarLabelStyle: {
            fontWeight: '700',
            fontSize: 12,
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Liste',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="list.bullet" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
          }}
        />
      </Tabs>
    </AuthGuard>
  );
}
