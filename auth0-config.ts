// Simple Auth0 config used by the app.
// Replace the placeholder values with your real Auth0 domain and clientId.
type Auth0Config = {
  domain: string;
  clientId: string;
};

const config: Auth0Config = {
  // Prefer environment variables when available (useful for CI or release builds),
  // otherwise fall back to an obvious placeholder string so TypeScript stays happy.
  domain: process.env.AUTH0_DOMAIN ?? 'dev-ijucl08spdudaszc.us.auth0.com',
  clientId: process.env.AUTH0_CLIENT_ID ?? 'Pf0WY4b3Q2yu6CllOGaZC4RIlolcd4xh',
};

export default config;