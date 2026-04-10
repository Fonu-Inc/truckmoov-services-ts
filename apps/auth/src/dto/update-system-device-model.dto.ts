import { PartialType } from '@nestjs/swagger';
import { CreateSystemDeviceModelDto } from './create-system-device-model.dto';

export class UpdateSystemDeviceModelDto extends PartialType(
  CreateSystemDeviceModelDto,
) {}
