import { jwtDecode } from 'jwt-decode';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth, useIdTokenClaims } from '@/lib/auth';
import { appConfig, getMissingConfig } from '@/lib/config';

type TokenClaims = Record<string, unknown>;

function decodeToken(token: string | null) {
  if (!token) {
    return null;
  }

  try {
    return jwtDecode<TokenClaims>(token);
  } catch {
    return null;
  }
}

function formatDate(seconds: number | null) {
  if (!seconds) {
    return 'Unknown';
  }

  return new Date(seconds * 1000).toLocaleString();
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'Not available';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return String(value);
}

function tokenPreview(token: string | null) {
  if (!token) {
    return 'Not available';
  }

  if (token.length <= 32) {
    return token;
  }

  return `${token.slice(0, 18)}...${token.slice(-12)}`;
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{formatValue(value)}</Text>
    </View>
  );
}

function Section({
  title,
  children,
}: React.PropsWithChildren<{
  title: string;
}>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <View style={styles.jsonBlock}>
      <Text style={styles.jsonText}>{JSON.stringify(value ?? {}, null, 2)}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const {
    accessToken,
    authError,
    configError,
    expiresIn,
    idToken,
    isAuthenticated,
    isLoading,
    issuedAt,
    logout,
    refreshToken,
  } = useAuth();
  const idTokenClaims = useIdTokenClaims<TokenClaims>();
  const accessTokenClaims = decodeToken(accessToken);
  const missingConfig = getMissingConfig();
  const sessionName =
    (typeof idTokenClaims?.name === 'string' && idTokenClaims.name) ||
    (typeof idTokenClaims?.given_name === 'string' && idTokenClaims.given_name) ||
    (typeof idTokenClaims?.nickname === 'string' && idTokenClaims.nickname) ||
    'Authenticated user';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Profile</Text>
          <Text style={styles.title}>{sessionName}</Text>
          <Text style={styles.subtitle}>
            Vollständige Übersicht aller Daten, die die App aktuell lokal kennt.
          </Text>
        </View>

        <Section title="Session">
          <DetailRow label="Authenticated" value={isAuthenticated} />
          <DetailRow label="Loading" value={isLoading} />
          <DetailRow label="Issued At" value={formatDate(issuedAt)} />
          <DetailRow
            label="Expires In"
            value={expiresIn ? `${expiresIn} seconds` : 'Unknown'}
          />
          <DetailRow label="Auth Error" value={authError} />
          <DetailRow label="Config Error" value={configError} />
        </Section>

        <Section title="Token Snapshot">
          <DetailRow label="Access Token" value={tokenPreview(accessToken)} />
          <DetailRow label="ID Token" value={tokenPreview(idToken)} />
          <DetailRow label="Refresh Token" value={tokenPreview(refreshToken)} />
        </Section>

        <Section title="Config">
          <DetailRow label="Backend URL" value={appConfig.backendUrl} />
          <DetailRow label="Auth0 Domain" value={appConfig.auth0Domain} />
          <DetailRow label="Auth0 Client ID" value={appConfig.auth0ClientId} />
          <DetailRow label="Auth0 Audience" value={appConfig.auth0Audience} />
          <DetailRow label="Auth0 Scope" value={appConfig.auth0Scope} />
          <DetailRow label="Logout Return Path" value={appConfig.auth0LogoutReturnPath} />
          <DetailRow
            label="Missing Config"
            value={missingConfig.length > 0 ? missingConfig.join(', ') : 'None'}
          />
        </Section>

        <Section title="ID Token Claims">
          <JsonBlock value={idTokenClaims} />
        </Section>

        <Section title="Access Token Claims">
          <JsonBlock value={accessTokenClaims ?? { decodable: false }} />
        </Section>

        <Pressable
          onPress={logout}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4efe4',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 16,
  },
  hero: {
    backgroundColor: '#7a5f34',
    borderRadius: 28,
    padding: 22,
    gap: 8,
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
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#f5ecda',
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    backgroundColor: '#fffaf0',
    borderRadius: 24,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#ead9b6',
  },
  sectionTitle: {
    color: '#7a5f34',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    color: '#836c44',
    fontSize: 12,
    fontWeight: '700',
  },
  detailValue: {
    color: '#2b312d',
    fontSize: 15,
    lineHeight: 22,
  },
  jsonBlock: {
    backgroundColor: '#f6f1e6',
    borderRadius: 16,
    padding: 14,
  },
  jsonText: {
    color: '#2b312d',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#184f59',
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff8e7',
    fontSize: 16,
    fontWeight: '800',
  },
});
