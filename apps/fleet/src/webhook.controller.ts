import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@shared/rbac";
import { IntegrationHealthService } from "./integration-health.service";
import { IntegrationHealthResponse } from "./dto/fleet.schema";

@ApiTags("Webhooks")
@Controller("webhooks")
@Public()
export class WebhookController {
  constructor(private readonly integrationHealth: IntegrationHealthService) {}

  @Get("health")
  @ApiOperation({ summary: "Integration health — K06" })
  @ApiOkResponse({ type: IntegrationHealthResponse })
  getIntegrationHealth() {
    return { status: true, message: "success", data: this.integrationHealth.getAll() };
  }
}
