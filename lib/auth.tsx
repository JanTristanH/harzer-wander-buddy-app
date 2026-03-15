import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { jwtDecode } from 'jwt-decode';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { appConfig, getMissingConfig } from '@/lib/config';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_STORAGE_KEY = 'hwb-auth-token-response';
const ONBOARDING_STORAGE_KEY = 'hwb-auth-onboarding-complete';

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
  hasCompletedOnboarding: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  configError: string | null;
  login: () => Promise<void>;
  signup: () => Promise<void>;
  logout: () => Promise<void>;
  resetApp: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getIssuer() {
  const domain = appConfig.auth0Domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${domain}`;
}

function normalizePath(path?: string | null) {
  if (typeof path !== 'string') {
    return 'auth/logout';
  }

  const normalizedPath = path.trim();
  return normalizedPath.length > 0 ? normalizedPath : 'auth/logout';
}

function getRedirectUri(path?: string | null) {
  const configScheme = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(configScheme) ? configScheme[0] : configScheme;

  return AuthSession.makeRedirectUri({
    scheme: scheme ?? 'harzerwanderbuddyapp',
    path: normalizePath(path),
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

async function saveOnboardingState(hasCompletedOnboarding: boolean) {
  await SecureStore.setItemAsync(
    ONBOARDING_STORAGE_KEY,
    hasCompletedOnboarding ? 'true' : 'false'
  );
}

async function loadOnboardingState() {
  const storedValue = await SecureStore.getItemAsync(ONBOARDING_STORAGE_KEY);
  return storedValue === 'true';
}

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const missingConfig = getMissingConfig().filter((key) => key !== 'auth0LogoutReturnPath');
  const configError =
    missingConfig.length > 0 ? `Missing Expo config: ${missingConfig.join(', ')}` : null;

  const resolveDiscovery = useCallback(async () => {
    if (configError) {
      return null;
    }

    return AuthSession.fetchDiscoveryAsync(getIssuer());
  }, [configError]);

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

        const storedOnboardingState = await loadOnboardingState();
        if (isMounted) {
          setHasCompletedOnboarding(storedOnboardingState);
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
        setHasCompletedOnboarding(true);
        await saveOnboardingState(true);
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
  }, [configError, resolveDiscovery]);

  const authenticate = useCallback(async (mode: 'login' | 'signup') => {
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
      await saveOnboardingState(true);
      setAuthState({
        accessToken: tokenResponse.accessToken,
        idToken: tokenResponse.idToken,
        refreshToken: tokenResponse.refreshToken,
        issuedAt: tokenResponse.issuedAt,
        expiresIn: tokenResponse.expiresIn,
      });
      setHasCompletedOnboarding(true);
    } catch (error) {
      console.error(`Auth0 ${mode} failed`, error);
      setAuthError(error instanceof Error ? error.message : `Auth0 ${mode} failed`);
    }
  }, [configError, resolveDiscovery]);

  const login = useCallback(async () => {
    await authenticate('login');
  }, [authenticate]);

  const signup = useCallback(async () => {
    await authenticate('signup');
  }, [authenticate]);

  const logout = useCallback(async () => {
    setAuthError(null);
    await clearTokenResponse();
    setAuthState(null);

    try {
      if (!configError && appConfig.auth0ClientId && appConfig.auth0Domain) {
        const returnTo = getRedirectUri(appConfig.auth0LogoutReturnPath);
        const logoutUrl =
          `${getIssuer()}/v2/logout?client_id=${encodeURIComponent(appConfig.auth0ClientId)}` +
          `&returnTo=${encodeURIComponent(returnTo)}`;
        await WebBrowser.openAuthSessionAsync(logoutUrl, returnTo);
      }
    } catch (error) {
      console.error('Auth0 logout failed', error);
    }
  }, [configError]);

  const resetApp = useCallback(async () => {
    await saveOnboardingState(false);
    setHasCompletedOnboarding(false);
    await logout();
  }, [logout]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      accessToken: authState?.accessToken ?? null,
      idToken: authState?.idToken ?? null,
      refreshToken: authState?.refreshToken ?? null,
      issuedAt: authState?.issuedAt ?? null,
      expiresIn: authState?.expiresIn ?? null,
      hasCompletedOnboarding,
      isAuthenticated: !!authState?.accessToken,
      isLoading,
      authError,
      configError,
      login,
      signup,
      logout,
      resetApp,
    }),
    [
      authError,
      authState?.accessToken,
      authState?.expiresIn,
      authState?.idToken,
      authState?.issuedAt,
      authState?.refreshToken,
      configError,
      login,
      hasCompletedOnboarding,
      isLoading,
      logout,
      resetApp,
      signup,
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
