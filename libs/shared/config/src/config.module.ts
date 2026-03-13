import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { AppConfigService } from "./app-config.service";
import { parseNodeEnv } from "./node-env";

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
      validate: (config: Record<string, unknown>) => ({
        ...config,
        NODE_ENV: parseNodeEnv(config.NODE_ENV),
      }),
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
