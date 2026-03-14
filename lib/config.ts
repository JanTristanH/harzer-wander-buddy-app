import Constants from 'expo-constants';

type ExtraConfig = {
  backendUrl?: string;
  auth0Domain?: string;
  auth0ClientId?: string;
  auth0Audience?: string;
  auth0Scope?: string;
  auth0LogoutReturnPath?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

function readConfig(key: keyof ExtraConfig, envKey: string) {
  const envValue = process.env[envKey];
  if (!Array.isArray(envValue) && typeof envValue === 'string' && envValue.length > 0) {
    return envValue;
  }

  const value = extra[key];
  return typeof value === 'string' ? value : '';
}

export const appConfig = {
  backendUrl: readConfig('backendUrl', 'EXPO_PUBLIC_BACKEND_URL'),
  auth0Domain: readConfig('auth0Domain', 'EXPO_PUBLIC_AUTH0_DOMAIN'),
  auth0ClientId: readConfig('auth0ClientId', 'EXPO_PUBLIC_AUTH0_CLIENT_ID'),
  auth0Audience: readConfig('auth0Audience', 'EXPO_PUBLIC_AUTH0_AUDIENCE'),
  auth0Scope:
    readConfig('auth0Scope', 'EXPO_PUBLIC_AUTH0_SCOPE') || 'openid profile email offline_access',
  auth0LogoutReturnPath:
    readConfig('auth0LogoutReturnPath', 'EXPO_PUBLIC_AUTH0_LOGOUT_RETURN_PATH') || 'auth/logout',
} as const;

export function getMissingConfig() {
  return Object.entries(appConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
