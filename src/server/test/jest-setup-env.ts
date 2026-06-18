import { useTestDatabase } from './test-database';

/**
 * Jest setupFiles entry — runs inside EACH worker process before the test
 * framework and any test module (including PrismaService / @nestjs/config) is
 * evaluated. This is the critical guard that keeps every worker pinned to the
 * test database even though globalSetup's env mutation does not propagate into
 * worker processes.
 */
useTestDatabase();
