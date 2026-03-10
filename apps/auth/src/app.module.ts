import { Module } from "@nestjs/common";
import { ConfigModule, AppConfigService } from "@shared/config";
import { LoggerModule } from "@shared/logger";
import {
  DbIdentityProvider,
  DevTokenService,
  GetMeUseCase,
  IDENTITY_PROVIDER,
  InMemorySessionStore,
  InMemoryUserRepository,
  LoginUseCase,
  MikroSessionStore,
  MikroUserRepository,
  RefreshUseCase,
  RegisterUseCase,
  SESSION_STORE,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from "./contexts/auth/session";
import { AuthController } from "./auth.controller";

@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [AuthController],
  providers: [
    InMemoryUserRepository,
    MikroUserRepository,
    {
      provide: USER_REPOSITORY,
      inject: [InMemoryUserRepository, MikroUserRepository, AppConfigService],
      useFactory: (
        inMemory: InMemoryUserRepository,
        mikro: MikroUserRepository,
        config: AppConfigService,
      ) => config.persistence.backend === "in-memory" ? inMemory : mikro,
    },
    DbIdentityProvider,
    {
      provide: IDENTITY_PROVIDER,
      useExisting: DbIdentityProvider,
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
    RegisterUseCase,
  ],
})
export class AppModule {}
