import { Module } from "@nestjs/common";
import { ConfigModule } from "../../../libs/shared/config/src";
import { LoggerModule } from "../../../libs/shared/logger/src";
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
      // Bind auth domain port to current identity adapter.
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
      inject: [InMemorySessionStore, MikroSessionStore],
      useFactory: (
        inMemoryStore: InMemorySessionStore,
        mikroStore: MikroSessionStore,
      ) => {
        // Use durable store by default; tests/dev can set in-memory explicitly.
        return (process.env.PERSISTENCE_BACKEND ?? "mikro-orm") === "in-memory"
          ? inMemoryStore
          : mikroStore;
      },
    },
    LoginUseCase,
    RefreshUseCase,
    GetMeUseCase,
  ],
})
export class AppModule {}
