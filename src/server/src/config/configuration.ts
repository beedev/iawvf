/**
 * Typed application configuration assembled from environment variables.
 *
 * Secrets (JWT_SECRET, OPENAI_API_KEY, DATABASE_URL) are read here but MUST NOT
 * be logged anywhere. Only non-sensitive metadata is ever surfaced.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  isProduction: boolean;
  corsOrigins: string[];
  jwt: {
    secret: string;
    expiresIn: string;
  };
  openai: {
    enabled: boolean;
    apiKey: string;
    model: string;
    baseUrl: string;
  };
}

const parsePort = (raw: string | undefined): number => {
  const port = Number.parseInt(raw ?? '4000', 10);
  return Number.isNaN(port) ? 4000 : port;
};

const parseOrigins = (raw: string | undefined): string[] =>
  (raw ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  return {
    nodeEnv,
    port: parsePort(process.env.PORT),
    isProduction: nodeEnv === 'production',
    corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
    jwt: {
      // In production this is validated as required (see env.validation.ts).
      // The dev fallback exists ONLY for local convenience and never ships.
      secret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    },
    openai: {
      enabled: (process.env.OPENAI_ENABLED ?? 'false').toLowerCase() === 'true',
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1',
      baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    },
  };
};
