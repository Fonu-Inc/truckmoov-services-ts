import { Module } from "@nestjs/common";
import { ConfigModule } from "@shared/config";
import { SecretCipherService } from "./secret-cipher.service";

@Module({
  imports: [ConfigModule],
  providers: [SecretCipherService],
  exports: [SecretCipherService],
})
export class CryptoModule {}
