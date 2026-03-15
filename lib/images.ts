export function buildAuthenticatedImageSource(uri: string, accessToken?: string | null) {
  return {
    uri,
    ...(accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : {}),
  };
}
