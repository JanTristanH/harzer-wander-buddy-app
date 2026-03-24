import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function IndexScreen() {
  const { hasCompletedOnboarding, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <Redirect
      href={
        (
          isAuthenticated
            ? hasCompletedOnboarding
              ? '/(tabs)'
              : '/onboarding'
            : hasCompletedOnboarding
              ? '/login'
              : '/onboarding'
        ) as never
      }
    />
  );
}
