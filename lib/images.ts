import { appConfig } from '@/lib/config';

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function resolveImageUri(uri: string) {
  const trimmedUri = uri.trim();
  if (!trimmedUri) {
    return trimmedUri;
  }

  if (/^(https?:|file:|data:|content:|asset:)/i.test(trimmedUri)) {
    return trimmedUri;
  }

  const backendBase = normalizeBaseUrl(appConfig.backendUrl);
  if (!backendBase) {
    return trimmedUri;
  }

  if (trimmedUri.startsWith('/')) {
    return `${backendBase}${trimmedUri}`;
  }

  return `${backendBase}/${trimmedUri}`;
}

function isBackendImageUri(uri: string) {
  const backendBase = normalizeBaseUrl(appConfig.backendUrl);
  if (!backendBase) {
    return false;
  }

  return uri.startsWith(`${backendBase}/`) || uri === backendBase;
}

function isAttachmentContentPath(pathname: string) {
  return (
    pathname.startsWith('/odata/v2/api/Attachments/') ||
    pathname.startsWith('/odata/v4/api/Attachments/')
  ) && pathname.endsWith('/content');
}

function rebaseLegacyAttachmentUri(uri: string) {
  const backendBase = normalizeBaseUrl(appConfig.backendUrl);
  if (!backendBase) {
    return uri;
  }

  try {
    const parsed = new URL(uri);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return uri;
    }

    if (!isAttachmentContentPath(parsed.pathname)) {
      return uri;
    }

    const backend = new URL(backendBase);
    return `${backend.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return uri;
  }
}

export function buildAuthenticatedImageSource(uri: string, accessToken?: string | null) {
  const resolvedUri = rebaseLegacyAttachmentUri(resolveImageUri(uri));
  const shouldUseAuthHeader = Boolean(accessToken && isBackendImageUri(resolvedUri));

  if (!shouldUseAuthHeader) {
    return resolvedUri;
  }

  return {
    uri: resolvedUri,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
}
