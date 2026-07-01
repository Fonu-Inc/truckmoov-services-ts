import { IsOptional, IsString } from "class-validator";

export class DataBundleListQueryDto {
  @IsOptional()
  @IsString()
  carrierId?: string;
}
