import { Controller, Get, Inject } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Controller('health')
export class HealthController {
  constructor(@Inject(RealtimeGateway) private readonly gateway: RealtimeGateway) {}

  /**
   * Reports open sockets. There is no Prometheus in this cluster, only
   * Grafana, Loki and Promtail, so the connection count has to be readable
   * somewhere or the cap is invisible until it is hit.
   */
  @Get()
  health() {
    return {
      status: true,
      message: 'success',
      data: { service: 'realtime', openConnections: this.gateway.openConnections() },
    };
  }
}
