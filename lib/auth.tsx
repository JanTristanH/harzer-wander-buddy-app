import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { jwtDecode } from 'jwt-decode';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { fetchCurrentUserProfile, type CurrentUserProfileData } from '@/lib/api';
import { appConfig, getMissingConfig } from '@/lib/config';
import { useConnectivity } from '@/lib/connectivity';
import { clearPersistedQueryCache } from '@/lib/query-persistence';
import { queryClient } from '@/lib/query-client';

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
  tokenType?: AuthSession.TokenType;
  scope?: string;
  idToken?: string;
  refreshToken?: string;
  issuedAt?: number;
  expiresIn?: number;
};

type SessionMode = 'online' | 'offline_grace';

type ResolveValidTokenResponseResult = {
  tokenResponse: AuthSession.TokenResponse | null;
  sessionMode: SessionMode;
};

type AuthContextValue = {
  accessToken: string | null;
  idToken: string | null;
  refreshToken: string | null;
  issuedAt: number | null;
  expiresIn: number | null;
  sessionMode: SessionMode;
  isOffline: boolean;
  canPerformWrites: boolean;
  currentUserProfile: CurrentUserProfileData | null;
  hasCompletedOnboarding: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  configError: string | null;
  login: () => Promise<void>;
  signup: () => Promise<void>;
  getValidAccessToken: () => Promise<string | null>;
  completeOnboarding: () => Promise<void>;
  logout: () => Promise<void>;
  resetApp: () => Promise<void>;
  preloadCurrentUserProfile: () => Promise<CurrentUserProfileData | null>;
  setCurrentUserProfile: (profile: CurrentUserProfileData | null) => void;
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
    tokenType: tokenResponse.tokenType,
    scope: tokenResponse.scope,
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
    tokenType: parsed.tokenType,
    scope: parsed.scope,
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

function isMissingCurrentUserProfile(error: unknown) {
  return (
    error instanceof Error &&
    /not found/i.test(error.message) &&
    /Users/i.test(error.message)
  );
}

function toAuthState(tokenResponse: AuthSession.TokenResponse): AuthState {
  return {
    accessToken: tokenResponse.accessToken,
    idToken: tokenResponse.idToken,
    refreshToken: tokenResponse.refreshToken,
    issuedAt: tokenResponse.issuedAt,
    expiresIn: tokenResponse.expiresIn,
  };
}

function isUnauthorizedError(error: unknown) {
  return error instanceof Error && error.name === 'UnauthorizedError';
}

function isInvalidGrantRefreshError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorRecord = error as {
    error?: unknown;
    message?: unknown;
    params?: {
      error?: unknown;
      error_description?: unknown;
    };
  };
  const errorCode = typeof errorRecord.error === 'string' ? errorRecord.error : '';
  const paramsErrorCode =
    typeof errorRecord.params?.error === 'string' ? errorRecord.params.error : '';
  const errorDescription =
    typeof errorRecord.params?.error_description === 'string'
      ? errorRecord.params.error_description
      : '';
  const message = typeof errorRecord.message === 'string' ? errorRecord.message : '';
  const normalizedText = `${errorCode} ${paramsErrorCode} ${errorDescription} ${message}`.toLowerCase();

  return normalizedText.includes('invalid_grant');
}

function mergeTokenResponse(
  previousTokenResponse: AuthSession.TokenResponse,
  nextTokenResponse: AuthSession.TokenResponse
) {
  return new AuthSession.TokenResponse({
    accessToken: nextTokenResponse.accessToken,
    tokenType: nextTokenResponse.tokenType ?? previousTokenResponse.tokenType,
    scope: nextTokenResponse.scope ?? previousTokenResponse.scope,
    idToken: nextTokenResponse.idToken ?? previousTokenResponse.idToken,
    refreshToken: nextTokenResponse.refreshToken ?? previousTokenResponse.refreshToken,
    issuedAt: nextTokenResponse.issuedAt ?? previousTokenResponse.issuedAt,
    expiresIn: nextTokenResponse.expiresIn ?? previousTokenResponse.expiresIn,
  });
}

function isNetworkRefreshError(error: unknown) {
  if (error instanceof TypeError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('timed out') ||
    message.includes('fetch')
  );
}

export function AuthProvider({ children }: React.PropsWithChildren) {
  const { isOffline } = useConnectivity();
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>('online');
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfileData | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<ResolveValidTokenResponseResult> | null>(null);

  const missingConfig = getMissingConfig().filter((key) => key !== 'auth0LogoutReturnPath');
  const configError =
    missingConfig.length > 0 ? `Missing Expo config: ${missingConfig.join(', ')}` : null;

  const resolveDiscovery = useCallback(async () => {
    if (configError) {
      return null;
    }

    return AuthSession.fetchDiscoveryAsync(getIssuer());
  }, [configError]);

  const preloadCurrentUserProfileForToken = useCallback(async (accessToken: string | null) => {
    if (!accessToken) {
      setCurrentUserProfile(null);
      return null;
    }

    try {
      const profile = await fetchCurrentUserProfile(accessToken);
      setCurrentUserProfile(profile);
      return profile;
    } catch (error) {
      if (error instanceof Error && error.name === 'UnauthorizedError') {
        throw error;
      }

      if (isMissingCurrentUserProfile(error)) {
        setCurrentUserProfile(null);
        setHasCompletedOnboarding(false);
        await saveOnboardingState(false);
        return null;
      }

      throw error;
    }
  }, []);

  const preloadCurrentUserProfile = useCallback(async () => {
    return preloadCurrentUserProfileForToken(authState?.accessToken ?? null);
  }, [authState?.accessToken, preloadCurrentUserProfileForToken]);

  const resolveValidTokenResponse = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      const forceRefresh = options?.forceRefresh ?? false;
      const tokenResponse = await loadTokenResponse();
      if (!tokenResponse) {
        return {
          tokenResponse: null,
          sessionMode: 'online',
        } satisfies ResolveValidTokenResponseResult;
      }

      if (!forceRefresh && !tokenResponse.shouldRefresh()) {
        return {
          tokenResponse,
          sessionMode: 'online',
        } satisfies ResolveValidTokenResponseResult;
      }

      if (!tokenResponse.refreshToken || !appConfig.auth0ClientId) {
        return {
          tokenResponse,
          sessionMode: isOffline ? 'offline_grace' : 'online',
        } satisfies ResolveValidTokenResponseResult;
      }

      try {
        const discovery = await resolveDiscovery();
        if (!discovery?.tokenEndpoint) {
          throw new Error('Could not load Auth0 discovery.');
        }

        const refreshedTokenResponse = await AuthSession.refreshAsync(
          {
            clientId: appConfig.auth0ClientId,
            refreshToken: tokenResponse.refreshToken,
          },
          discovery
        );
        const mergedTokenResponse = mergeTokenResponse(tokenResponse, refreshedTokenResponse);
        await saveTokenResponse(mergedTokenResponse);
        return {
          tokenResponse: mergedTokenResponse,
          sessionMode: 'online',
        } satisfies ResolveValidTokenResponseResult;
      } catch (error) {
        if (isOffline || isNetworkRefreshError(error)) {
          return {
            tokenResponse,
            sessionMode: 'offline_grace',
          } satisfies ResolveValidTokenResponseResult;
        }

        throw error;
      }
    },
    [isOffline, resolveDiscovery]
  );

  const getValidAccessToken = useCallback(async () => {
    if (configError) {
      return null;
    }

    try {
      if (!refreshPromiseRef.current) {
        refreshPromiseRef.current = resolveValidTokenResponse().finally(() => {
          refreshPromiseRef.current = null;
        });
      }

      const resolved = await refreshPromiseRef.current;
      if (resolved.tokenResponse) {
        setAuthState(toAuthState(resolved.tokenResponse));
        setSessionMode(resolved.sessionMode);
        return resolved.tokenResponse.accessToken;
      }

      setAuthState(null);
      setSessionMode('online');
      return null;
    } catch (error) {
      const shouldInvalidateSession =
        isUnauthorizedError(error) || isInvalidGrantRefreshError(error);

      if (shouldInvalidateSession) {
        await clearTokenResponse();
        setAuthState(null);
        setSessionMode('online');
        setCurrentUserProfile(null);
        return null;
      }

      throw error;
    }
  }, [configError, resolveValidTokenResponse]);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      if (configError) {
        setIsLoading(false);
        return;
      }

      try {
        const storedOnboardingState = await loadOnboardingState();
        if (isMounted) {
          setHasCompletedOnboarding(storedOnboardingState);
        }

        const resolved = await resolveValidTokenResponse();
        if (!resolved.tokenResponse) {
          return;
        }

        if (isMounted) {
          setAuthState(toAuthState(resolved.tokenResponse));
          setSessionMode(resolved.sessionMode);
        }

        if (!isMounted) {
          return;
        }

        if (resolved.sessionMode === 'offline_grace') {
          return;
        }

        await preloadCurrentUserProfileForToken(resolved.tokenResponse.accessToken);
        if (!isMounted) {
          return;
        }
      } catch (error) {
        const shouldInvalidateSession =
          isUnauthorizedError(error) || isInvalidGrantRefreshError(error);

        console.error('Failed to restore auth session', error);
        setAuthError(error instanceof Error ? error.message : 'Failed to restore auth session');

        if (shouldInvalidateSession) {
          await clearTokenResponse();
          if (isMounted) {
            setAuthState(null);
            setSessionMode('online');
            setCurrentUserProfile(null);
          }
        }
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
  }, [configError, preloadCurrentUserProfileForToken, resolveValidTokenResponse]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status !== 'active') {
        return;
      }

      void getValidAccessToken().catch((error) => {
        console.error('Failed to refresh auth token on foreground', error);
      });
    });

    return () => {
      subscription.remove();
    };
  }, [getValidAccessToken]);

  const authenticate = useCallback(async (mode: 'login' | 'signup') => {
    if (configError) {
      return;
    }

    setAuthError(null);
    setIsLoading(true);

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
      setCurrentUserProfile(null);
      setSessionMode('online');
      setAuthState({
        accessToken: tokenResponse.accessToken,
        idToken: tokenResponse.idToken,
        refreshToken: tokenResponse.refreshToken,
        issuedAt: tokenResponse.issuedAt,
        expiresIn: tokenResponse.expiresIn,
      });
      await preloadCurrentUserProfileForToken(tokenResponse.accessToken);
    } catch (error) {
      console.error(`Auth0 ${mode} failed`, error);
      setAuthError(error instanceof Error ? error.message : `Auth0 ${mode} failed`);
    } finally {
      setIsLoading(false);
    }
  }, [configError, preloadCurrentUserProfileForToken, resolveDiscovery]);

  const login = useCallback(async () => {
    await authenticate('login');
  }, [authenticate]);

  const signup = useCallback(async () => {
    await authenticate('signup');
  }, [authenticate]);

  const completeOnboarding = useCallback(async () => {
    await saveOnboardingState(true);
    setHasCompletedOnboarding(true);
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    await clearTokenResponse();
    await clearPersistedQueryCache();
    queryClient.clear();
    setAuthState(null);
    setSessionMode('online');
    setCurrentUserProfile(null);

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
    setCurrentUserProfile(null);
    await logout();
  }, [logout]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      accessToken: authState?.accessToken ?? null,
      idToken: authState?.idToken ?? null,
      refreshToken: authState?.refreshToken ?? null,
      issuedAt: authState?.issuedAt ?? null,
      expiresIn: authState?.expiresIn ?? null,
      sessionMode,
      isOffline,
      canPerformWrites: !!authState?.accessToken && !isOffline,
      currentUserProfile,
      hasCompletedOnboarding,
      isAuthenticated: !!authState?.accessToken,
      isLoading,
      authError,
      configError,
      completeOnboarding,
      login,
      signup,
      getValidAccessToken,
      logout,
      resetApp,
      preloadCurrentUserProfile,
      setCurrentUserProfile,
    }),
    [
      authError,
      authState?.accessToken,
      authState?.expiresIn,
      authState?.idToken,
      authState?.issuedAt,
      authState?.refreshToken,
      sessionMode,
      configError,
      completeOnboarding,
      currentUserProfile,
      getValidAccessToken,
      isOffline,
      login,
      hasCompletedOnboarding,
      isLoading,
      logout,
      preloadCurrentUserProfile,
      resetApp,
      setCurrentUserProfile,
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
