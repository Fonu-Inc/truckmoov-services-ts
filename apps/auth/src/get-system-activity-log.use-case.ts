import { Inject, Injectable } from "@nestjs/common";
import { ActivityLogService } from "./activity-log.service";
import type { ActivityLogQuery } from "./activity-log.types";

@Injectable()
export class GetSystemActivityLogUseCase {
  constructor(
    @Inject(ActivityLogService)
    private readonly activityLog: ActivityLogService,
  ) {}

  async execute(accessToken: string, filters: ActivityLogQuery) {
    const data = await this.activityLog.querySystemForAccessToken(accessToken, filters);
    return {
      status: true,
      message: "success",
      data,
    };
  }
}
