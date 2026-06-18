import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';

/**
 * Hard cap on request body size (defence-in-depth DoS guard). Fact documents and
 * rule JSON are small; 1 MB is generous while still rejecting oversized payloads
 * before they reach validation. Oversized bodies are rejected at the parser with a
 * 413, normalized by the global problem+json filter.
 */
const MAX_REQUEST_BODY = '1mb';

/**
 * Composition root. Configures cross-cutting concerns (logging, validation,
 * error normalization, CORS, Swagger) before the server starts listening.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Explicit body-size limits (DoS guard) on the JSON/urlencoded parsers, rather
  // than relying on the framework default.
  app.useBodyParser('json', { limit: MAX_REQUEST_BODY });
  app.useBodyParser('urlencoded', { limit: MAX_REQUEST_BODY, extended: true });

  // Route Nest's internal logging through pino (structured + redacted).
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const port = configService.get<AppConfig['port']>('port') ?? 4000;
  const corsOrigins =
    configService.get<AppConfig['corsOrigins']>('corsOrigins') ?? [];

  // Strip unknown properties, reject extras, and coerce types on input DTOs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Normalize all errors to RFC 7807 problem+json (no stack traces/secrets).
  app.useGlobalFilters(new ProblemDetailsFilter());

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Graceful shutdown hooks (Prisma disconnect, etc.).
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('IAW Validation & Decision Framework — API')
    .setDescription('Node/TypeScript backend (N0 foundation).')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger', app, document);

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`IAW server listening on port ${port} (Swagger at /swagger).`);
}

void bootstrap();
