import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { jwtDecode } from 'jwt-decode';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { appConfig, getMissingConfig } from '@/lib/config';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_STORAGE_KEY = 'hwb-auth-token-response';

type AuthState = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  issuedAt?: number;
  expiresIn?: number;
};

type StoredTokenState = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  issuedAt?: number;
  expiresIn?: number;
};

type AuthContextValue = {
  accessToken: string | null;
  idToken: string | null;
  refreshToken: string | null;
  issuedAt: number | null;
  expiresIn: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  configError: string | null;
  login: () => Promise<void>;
  signup: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getIssuer() {
  const domain = appConfig.auth0Domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${domain}`;
}

function getRedirectUri(path: string) {
  const configScheme = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(configScheme) ? configScheme[0] : configScheme;

  return AuthSession.makeRedirectUri({
    scheme: scheme ?? 'harzerwanderbuddyapp',
    path,
  });
}

function decodeJwt<T>(token: string | undefined): T | null {
  if (!token) {
    return null;
  }

  try {
    return jwtDecode<T>(token);
  } catch {
    return null;
  }
}

async function saveTokenResponse(tokenResponse: AuthSession.TokenResponse) {
  const payload: StoredTokenState = {
    accessToken: tokenResponse.accessToken,
    idToken: tokenResponse.idToken,
    refreshToken: tokenResponse.refreshToken,
    issuedAt: tokenResponse.issuedAt,
    expiresIn: tokenResponse.expiresIn,
  };

  await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, JSON.stringify(payload));
}

async function loadTokenResponse() {
  const storedValue = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  if (!storedValue) {
    return null;
  }

  const parsed = JSON.parse(storedValue) as StoredTokenState;
  return new AuthSession.TokenResponse({
    accessToken: parsed.accessToken,
    idToken: parsed.idToken,
    refreshToken: parsed.refreshToken,
    issuedAt: parsed.issuedAt,
    expiresIn: parsed.expiresIn,
  });
}

async function clearTokenResponse() {
  await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
}

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const missingConfig = getMissingConfig().filter((key) => key !== 'auth0LogoutReturnPath');
  const configError =
    missingConfig.length > 0 ? `Missing Expo config: ${missingConfig.join(', ')}` : null;

  async function resolveDiscovery() {
    if (configError) {
      return null;
    }

    return AuthSession.fetchDiscoveryAsync(getIssuer());
  }

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      if (configError) {
        setIsLoading(false);
        return;
      }

      try {
        const discovery = await resolveDiscovery();
        if (!discovery) {
          setAuthError('Could not load Auth0 discovery.');
          return;
        }

        const tokenResponse = await loadTokenResponse();
        if (!tokenResponse) {
          return;
        }

        let nextTokenResponse = tokenResponse;
        if (
          tokenResponse.shouldRefresh() &&
          tokenResponse.refreshToken &&
          discovery.tokenEndpoint
        ) {
          nextTokenResponse = await AuthSession.refreshAsync(
            {
              clientId: appConfig.auth0ClientId,
              refreshToken: tokenResponse.refreshToken,
            },
            discovery
          );
          await saveTokenResponse(nextTokenResponse);
        }

        if (!isMounted) {
          return;
        }

        setAuthState({
          accessToken: nextTokenResponse.accessToken,
          idToken: nextTokenResponse.idToken,
          refreshToken: nextTokenResponse.refreshToken,
          issuedAt: nextTokenResponse.issuedAt,
          expiresIn: nextTokenResponse.expiresIn,
        });
      } catch (error) {
        console.error('Failed to restore auth session', error);
        setAuthError(error instanceof Error ? error.message : 'Failed to restore auth session');
        await clearTokenResponse();
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [configError]);

  async function authenticate(mode: 'login' | 'signup') {
    if (configError) {
      return;
    }

    setAuthError(null);

    try {
      const discovery = await resolveDiscovery();
      if (!discovery) {
        setAuthError('Could not load Auth0 discovery.');
        return;
      }

      const redirectUri = getRedirectUri('auth/callback');
      const request = new AuthSession.AuthRequest({
        clientId: appConfig.auth0ClientId,
        scopes: appConfig.auth0Scope.split(' '),
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
        extraParams: {
          audience: appConfig.auth0Audience,
          ...(mode === 'signup' ? { screen_hint: 'signup' } : {}),
        },
      });

      await request.makeAuthUrlAsync(discovery);
      console.log(`Auth0 ${mode} redirect URI:`, redirectUri);

      const result = await request.promptAsync(discovery);
      console.log(`Auth0 ${mode} prompt result type:`, result.type);

      if (result.type !== 'success' || !result.params.code) {
        if (result.type !== 'dismiss' && result.type !== 'cancel') {
          setAuthError(`Auth0 ${mode} did not return an authorization code.`);
        }
        return;
      }

      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: appConfig.auth0ClientId,
          code: result.params.code,
          redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier ?? '',
          },
        },
        discovery
      );

      await saveTokenResponse(tokenResponse);
      setAuthState({
        accessToken: tokenResponse.accessToken,
        idToken: tokenResponse.idToken,
        refreshToken: tokenResponse.refreshToken,
        issuedAt: tokenResponse.issuedAt,
        expiresIn: tokenResponse.expiresIn,
      });
    } catch (error) {
      console.error(`Auth0 ${mode} failed`, error);
      setAuthError(error instanceof Error ? error.message : `Auth0 ${mode} failed`);
    }
  }

  async function login() {
    await authenticate('login');
  }

  async function signup() {
    await authenticate('signup');
  }

  async function logout() {
    const returnTo = getRedirectUri(appConfig.auth0LogoutReturnPath);

    try {
      if (!configError) {
        const discovery = await resolveDiscovery();
        if (!discovery) {
          setAuthError('Could not load Auth0 discovery.');
          return;
        }

        const logoutUrl =
          `${getIssuer()}/v2/logout?client_id=${encodeURIComponent(appConfig.auth0ClientId)}` +
          `&returnTo=${encodeURIComponent(returnTo)}`;
        await WebBrowser.openAuthSessionAsync(logoutUrl, returnTo);
      }
    } catch (error) {
      console.error('Auth0 logout failed', error);
    } finally {
      await clearTokenResponse();
      setAuthState(null);
    }
  }

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      accessToken: authState?.accessToken ?? null,
      idToken: authState?.idToken ?? null,
      refreshToken: authState?.refreshToken ?? null,
      issuedAt: authState?.issuedAt ?? null,
      expiresIn: authState?.expiresIn ?? null,
      isAuthenticated: !!authState?.accessToken,
      isLoading,
      authError,
      configError,
      login,
      signup,
      logout,
    }),
    [
      authError,
      authState?.accessToken,
      authState?.expiresIn,
      authState?.idToken,
      authState?.issuedAt,
      authState?.refreshToken,
      configError,
      isLoading,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}

export function useIdTokenClaims<T>() {
  const { idToken } = useAuth();
  return decodeJwt<T>(idToken ?? undefined);
}
