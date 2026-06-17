import { Inject, Injectable } from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { PaymentEventService } from './payment-event.service';

@Injectable()
export class SubscribePaymentEventsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    private readonly paymentEventService: PaymentEventService,
  ) {}

  execute(accessToken: string): Observable<{ data: unknown }> {
    return from(
      resolveActorUser(accessToken, this.tokenService, this.userRepository),
    ).pipe(
      switchMap((actor) => this.paymentEventService.subscribe(actor.tenantId)),
    );
  }
}
