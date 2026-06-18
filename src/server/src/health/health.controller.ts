import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

type CheckStatus = 'ok' | 'down';

interface HealthCheck {
  name: string;
  status: CheckStatus;
}

interface HealthResponse {
  status: CheckStatus;
  checks: HealthCheck[];
}

/**
 * Liveness/readiness endpoint. Public (no auth) so orchestrators can probe it.
 * Reports an aggregate status plus per-dependency checks. Never leaks
 * underlying error details.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Service and dependency health.' })
  async check(): Promise<HealthResponse> {
    const postgresOk = await this.prisma.isHealthy();

    const checks: HealthCheck[] = [
      { name: 'postgres', status: postgresOk ? 'ok' : 'down' },
    ];

    const status: CheckStatus = checks.every((c) => c.status === 'ok')
      ? 'ok'
      : 'down';

    return { status, checks };
  }
}
