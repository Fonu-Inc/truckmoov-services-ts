import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AppConfigService } from "@shared/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SyncErpJobUseCase, type ErpJobPayload } from "./contexts/fleet/integrations/application/sync-erp-job.use-case";
import { IntegrationHealthService } from "./integration-health.service";
import { ErpJobSyncWebhookDto } from "./dto/webhook.dto";
import { ErpWebhookResponse, IntegrationHealthResponse } from "./dto/fleet.schema";

@ApiTags("Webhooks")
@Controller("webhooks")
export class WebhookController {
  private readonly erpSecret: string;

  constructor(
    private readonly syncErpJob: SyncErpJobUseCase,
    private readonly integrationHealth: IntegrationHealthService,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.erpSecret = config.webhooks.erpSecret;
  }

  @Post("erp")
  @ApiOperation({ summary: "ERP/TMS job sync webhook — K05" })
  @ApiBody({ type: ErpJobSyncWebhookDto })
  @ApiOkResponse({ type: ErpWebhookResponse })
  async handleErp(
    @Req() req: RawBodyRequest<object>,
    @Headers("x-hub-signature-256") sigHeader: string | undefined,
    @Body() body: ErpJobPayload,
  ): Promise<{ ok: boolean; jobId: string }> {
    try {
      this.verifySignature(req.rawBody, sigHeader, this.erpSecret);

      const job = await this.syncErpJob.execute(body);
      this.integrationHealth.recordSuccess("erp");
      return { ok: true, jobId: job.jobId };
    } catch (err) {
      this.integrationHealth.recordFailure("erp");
      throw err;
    }
  }

  @Get("health")
  @ApiOperation({ summary: "Integration health — K06" })
  @ApiOkResponse({ type: IntegrationHealthResponse })
  getIntegrationHealth() {
    return { status: true, message: "success", data: this.integrationHealth.getAll() };
  }

  private verifySignature(rawBody: Buffer | undefined, sigHeader: string | undefined, secret: string): void {
    if (!secret) return;
    if (!sigHeader || !rawBody) throw new ForbiddenException("Missing signature");

    const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    const sigBuf = Buffer.from(sigHeader);
    const expBuf = Buffer.from(expected);

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new ForbiddenException("Invalid signature");
    }
  }
}
