import { Module } from "@nestjs/common";
import { ConfigModule } from "@shared/config";
import { ObjectStorageService } from "./object-storage.service";

@Module({
  imports: [ConfigModule],
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule {}
