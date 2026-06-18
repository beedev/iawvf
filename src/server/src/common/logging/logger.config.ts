import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Structured (pino) logging configuration.
 *
 * Hard guarantees:
 *  - Authorization headers, cookies, and known secret fields are REDACTED so
 *    tokens/credentials never reach the logs.
 *  - Request bodies are NOT auto-serialized (avoids logging passwords/PHI).
 *  - Each request gets a correlation id (reusing x-request-id when present).
 *
 * Pretty-printing is enabled only outside production for readability.
 */
export function buildLoggerConfig(isProduction: boolean): Params {
  return {
    pinoHttp: {
      level: isProduction ? 'info' : 'debug',
      genReqId: (req: IncomingMessage) => {
        const existing = req.headers['x-request-id'];
        if (typeof existing === 'string' && existing.length > 0) {
          return existing;
        }
        return randomUUID();
      },
      // Redact anything that could carry a secret, token, or credential.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'req.body.password',
          'req.body.accessToken',
          '*.password',
          '*.accessToken',
          '*.apiKey',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
      // Minimal, non-sensitive request/response serialization.
      serializers: {
        req: (req: IncomingMessage & { id?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
    },
  };
}
