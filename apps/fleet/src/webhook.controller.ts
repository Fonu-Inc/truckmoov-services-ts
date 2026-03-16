import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AppConfigService } from "@shared/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ProcessCpaasReplyUseCase } from "./contexts/fleet/integrations/application/process-cpaas-reply.use-case";
import { SyncErpJobUseCase, type ErpJobPayload } from "./contexts/fleet/integrations/application/sync-erp-job.use-case";
import { IntegrationHealthService } from "./integration-health.service";

@ApiTags("Webhooks")
@Controller("webhooks")
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly webhookSecret: string;
  private readonly ipAllowlist: Set<string>;
  private readonly erpSecret: string;

  constructor(
    private readonly processCpaasReply: ProcessCpaasReplyUseCase,
    private readonly syncErpJob: SyncErpJobUseCase,
    private readonly integrationHealth: IntegrationHealthService,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.webhookSecret = config.webhooks.cpaasSecret;
    this.erpSecret = config.webhooks.erpSecret;
    const raw = config.webhooks.cpaasIpAllowlist;
    this.ipAllowlist = new Set(raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : []);
  }

  @Post("cpaas")
  @ApiOperation({ summary: "CPaaS inbound webhook — K01/K02" })
  async handleCpaas(
    @Req() req: RawBodyRequest<{ ip?: string }>,
    @Headers("x-hub-signature-256") sigHeader: string | undefined,
    @Body() body: Record<string, string>,
  ): Promise<{ ok: boolean }> {
    try {
      this.verifyIp(req.ip);
      this.verifySignature(req.rawBody, sigHeader, this.webhookSecret);

      const from = (body["From"] ?? "").replace(/^whatsapp:/, "");
      const text = body["Body"] ?? "";
      const tenantId = body["tenant_id"] ?? "default";

      if (from && text) {
        await this.processCpaasReply.execute(tenantId, from, text);
      }

      this.integrationHealth.recordSuccess("cpaas");
      return { ok: true };
    } catch (err) {
      this.integrationHealth.recordFailure("cpaas");
      throw err;
    }
  }

  @Post("erp")
  @ApiOperation({ summary: "ERP/TMS job sync webhook — K05" })
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
  getIntegrationHealth() {
    return { status: true, data: this.integrationHealth.getAll() };
  }

  private verifyIp(ip: string | undefined): void {
    if (this.ipAllowlist.size === 0) return;
    if (!ip || !this.ipAllowlist.has(ip)) {
      throw new ForbiddenException("IP not in allowlist");
    }
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
