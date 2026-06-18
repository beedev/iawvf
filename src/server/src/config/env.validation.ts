/**
 * Environment validation executed by @nestjs/config at startup.
 *
 * Fails fast (process refuses to boot) when required configuration is missing.
 * Crucially: JWT_SECRET is mandatory in production so the app never signs tokens
 * with the insecure dev fallback.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];

  const nodeEnv = (config.NODE_ENV as string | undefined) ?? 'development';
  const isProduction = nodeEnv === 'production';

  const databaseUrl = config.DATABASE_URL as string | undefined;
  if (!databaseUrl || databaseUrl.trim().length === 0) {
    errors.push('DATABASE_URL is required.');
  }

  const jwtSecret = config.JWT_SECRET as string | undefined;
  if (isProduction && (!jwtSecret || jwtSecret.trim().length < 16)) {
    errors.push(
      'JWT_SECRET is required in production and must be at least 16 characters.',
    );
  }

  const openaiEnabled =
    ((config.OPENAI_ENABLED as string | undefined) ?? 'false').toLowerCase() ===
    'true';
  if (openaiEnabled) {
    const apiKey = config.OPENAI_API_KEY as string | undefined;
    if (!apiKey || apiKey.trim().length === 0) {
      errors.push('OPENAI_API_KEY is required when OPENAI_ENABLED=true.');
    }
  }

  if (errors.length > 0) {
    // Do NOT echo the offending values — only the field-level reason.
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`,
    );
  }

  return config;
}
