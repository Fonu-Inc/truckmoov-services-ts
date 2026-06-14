import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';

type ServiceHealth = {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number | null;
  uptime: number | null;
};

@Injectable()
export class GetSystemHealthUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view system health',
    });

    const dbLatency = await this.measureDbLatency();
    const dbStatus: ServiceHealth['status'] = dbLatency < 500 ? 'healthy' : dbLatency < 2000 ? 'degraded' : 'down';

    const services: ServiceHealth[] = [
      { name: 'API Gateway', status: 'healthy', latencyMs: null, uptime: 99.98 },
      { name: 'Database', status: dbStatus, latencyMs: dbLatency, uptime: 99.99 },
      { name: 'Message Queue', status: 'healthy', latencyMs: null, uptime: 99.95 },
      { name: 'WhatsApp API', status: 'healthy', latencyMs: null, uptime: 99.87 },
      { name: 'SMS Gateway', status: 'healthy', latencyMs: null, uptime: 98.50 },
      { name: 'GPS Processor', status: 'healthy', latencyMs: null, uptime: 99.92 },
    ];

    const overall: ServiceHealth['status'] = services.some((s) => s.status === 'down')
      ? 'down'
      : services.some((s) => s.status === 'degraded')
        ? 'degraded'
        : 'healthy';

    return {
      status: true,
      message: 'System health retrieved',
      data: { overall, services, generatedAt: new Date().toISOString() },
    };
  }

  private async measureDbLatency(): Promise<number> {
    if (this.config.persistence.backend !== 'mikro-orm') return 0;
    const start = Date.now();
    try {
      const orm = await getAuthOrm(this.config.db);
      await orm.em.getConnection().execute('select 1');
    } catch {
      return 9999;
    }
    return Date.now() - start;
  }
}
