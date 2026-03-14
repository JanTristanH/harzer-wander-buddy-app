import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StampRow } from '@/components/stamp-row';
import { fetchStampboxes, type Stampbox } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function StampsScreen() {
  const { accessToken, logout } = useAuth();
  const [stamps, setStamps] = useState<Stampbox[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadStamps = useCallback(
    async (refresh = false) => {
      if (!accessToken) {
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const nextStamps = await fetchStampboxes(accessToken);
        setStamps(nextStamps);
        setError(null);
      } catch (nextError) {
        if (nextError instanceof Error && nextError.name === 'UnauthorizedError') {
          await logout();
          return;
        }

        setError(nextError instanceof Error ? nextError.message : 'Unknown error');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, logout]
  );

  useEffect(() => {
    void loadStamps();
  }, [loadStamps]);

  const content = (() => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#184f59" />
          <Text style={styles.helperText}>Loading stamps from CAP OData v4…</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Request failed</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      );
    }

    if (stamps.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>No stamps found</Text>
          <Text style={styles.errorBody}>The service returned an empty Stampboxes collection.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={stamps}
        keyExtractor={(item) => item.ID}
        renderItem={({ item }) => <StampRow stamp={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadStamps(true)}
            tintColor="#184f59"
          />
        }
      />
    );
  })();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Stampboxes</Text>
        <Text style={styles.title}>All Harzer stamps</Text>
        <Text style={styles.subtitle}>
          Authenticated through Auth0, loaded from `/odata/v4/api/Stampboxes`.
        </Text>
      </View>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4efe4',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 6,
    backgroundColor: '#184f59',
  },
  eyebrow: {
    color: '#f1dfb8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff8e7',
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: '#d8ece6',
    fontSize: 14,
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  helperText: {
    color: '#184f59',
    fontSize: 15,
  },
  errorTitle: {
    color: '#3d2a15',
    fontSize: 22,
    fontWeight: '800',
  },
  errorBody: {
    color: '#655d4a',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
