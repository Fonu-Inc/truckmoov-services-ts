import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { NatsLink } from './nats-link.service';
import { RealtimeGateway } from './realtime.gateway';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(RealtimeGateway) private readonly gateway: RealtimeGateway,
    @Inject(NatsLink) private readonly link: NatsLink,
  ) {}

  /**
   * Reports open sockets. There is no Prometheus in this cluster, only
   * Grafana, Loki and Promtail, so the connection count has to be readable
   * somewhere or the cap is invisible until it is hit.
   */
  @Get()
  health() {
    // A pod without NATS accepts sockets it can never deliver to.
    if (!this.link.isUp()) throw new ServiceUnavailableException('nats_down');
    return {
      status: true,
      message: 'success',
      data: { service: 'realtime', openConnections: this.gateway.openConnections() },
    };
  }
}
