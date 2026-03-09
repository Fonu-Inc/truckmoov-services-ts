import { Module } from "@nestjs/common";
import { ConfigModule, AppConfigService } from "@shared/config";
import { LoggerModule } from "@shared/logger";
import {
  DevIdentityProvider,
  DevTokenService,
  GetMeUseCase,
  IDENTITY_PROVIDER,
  InMemorySessionStore,
  LoginUseCase,
  MikroSessionStore,
  RefreshUseCase,
  SESSION_STORE,
  TOKEN_SERVICE,
} from "./contexts/auth/session";
import { AuthController } from "./auth.controller";

@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [AuthController],
  providers: [
    DevIdentityProvider,
    {
      provide: IDENTITY_PROVIDER,
      useExisting: DevIdentityProvider,
    },
    DevTokenService,
    {
      provide: TOKEN_SERVICE,
      useExisting: DevTokenService,
    },
    InMemorySessionStore,
    MikroSessionStore,
    {
      provide: SESSION_STORE,
      inject: [InMemorySessionStore, MikroSessionStore, AppConfigService],
      useFactory: (
        inMemoryStore: InMemorySessionStore,
        mikroStore: MikroSessionStore,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemoryStore : mikroStore,
    },
    LoginUseCase,
    RefreshUseCase,
    GetMeUseCase,
  ],
})
export class AppModule {}
