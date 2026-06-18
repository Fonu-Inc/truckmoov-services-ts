import { Injectable } from '@nestjs/common';

@Injectable()
export class GetDeviceMappingTemplateUseCase {
  execute(): { csv: string; filename: string } {
    return {
      csv: 'device_name,device_type,imei,vehicle_id,notes\nTracker Unit 1,GPS Tracker,359779090012345,LAG-123-ABC,Primary tracker\n',
      filename: 'device-mapping-template.csv',
    };
  }
}
