import { Injectable } from '@nestjs/common';

@Injectable()
export class GetSimImportTemplateUseCase {
  execute(): { csv: string; filename: string } {
    return {
      csv: 'iccid,imsi,mobile_number,operator,data_limit_gb,sim_type,monthly_rental_naira\n89234012345678901234,,08031234567,MTN,1,iot_basic,1500\n',
      filename: 'sim-import-template.csv',
    };
  }
}
