import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

export default function IndexScreen() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return <Redirect href={(isAuthenticated ? '/(tabs)' : '/login') as never} />;
}
