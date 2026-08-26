import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Role, Roles, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, type FleetRequestContext } from "./base.controller";
import { GenerateInvoiceUseCase } from "./contexts/fleet/waybills/application/use-cases/generate-invoice.use-case";
import {
  ApproveInvoiceUseCase,
  MarkInvoicePaidUseCase,
  SendInvoiceUseCase,
} from "./contexts/fleet/waybills/application/use-cases/invoice-lifecycle.use-cases";
import {
  GetInvoiceSettingsUseCase,
  SaveInvoiceSettingsUseCase,
} from "./contexts/fleet/waybills/application/use-cases/invoice-settings.use-cases";
import {
  ListInvoicesUseCase,
  toInvoiceRow,
} from "./contexts/fleet/waybills/application/use-cases/list-invoices.use-case";
import {
  DeactivatePricingRuleUseCase,
  ListPricingRulesUseCase,
  SavePricingRuleUseCase,
  toPricingRuleRow,
} from "./contexts/fleet/waybills/application/use-cases/pricing-rule.use-cases";
import { INVOICE_STATUSES } from "./contexts/fleet/waybills/domain/entities/customer-invoice.entity";
import {
  GenerateInvoiceDto,
  MarkInvoicePaidDto,
  SaveInvoiceSettingsDto,
  SavePricingRuleDto,
  SendInvoiceDto,
} from "./dto/waybill.dto";
import { TenantScoped } from "./tenant-scoped.decorator";

const READ_ROLES = [
  Role.ENTERPRISE_ADMIN,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.OWNER_OPERATOR,
  Role.FINANCE_VIEWER,
] as const;

/** Issuing and settling a customer invoice is a finance action, not a dispatch one. */
const WRITE_ROLES = [
  Role.ENTERPRISE_ADMIN,
  Role.FLEET_ADMIN,
  Role.OWNER_OPERATOR,
] as const;

/** The interface works in naira; storage is kobo like every amount on the platform. */
function toKobo(naira: number | null | undefined): number | null {
  if (naira === null || naira === undefined) return null;
  return Math.round(naira * 100);
}

@ApiTags("Invoicing")
@Controller("invoicing")
@TenantScoped()
@UseGuards(RolesGuard)
export class InvoicingController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ListPricingRulesUseCase) private readonly listRules: ListPricingRulesUseCase,
    @Inject(SavePricingRuleUseCase) private readonly saveRule: SavePricingRuleUseCase,
    @Inject(DeactivatePricingRuleUseCase) private readonly deactivateRule: DeactivatePricingRuleUseCase,
    @Inject(GetInvoiceSettingsUseCase) private readonly getSettings: GetInvoiceSettingsUseCase,
    @Inject(SaveInvoiceSettingsUseCase) private readonly saveSettings: SaveInvoiceSettingsUseCase,
    @Inject(ListInvoicesUseCase) private readonly listInvoices: ListInvoicesUseCase,
    @Inject(GenerateInvoiceUseCase) private readonly generate: GenerateInvoiceUseCase,
    @Inject(ApproveInvoiceUseCase) private readonly approve: ApproveInvoiceUseCase,
    @Inject(SendInvoiceUseCase) private readonly send: SendInvoiceUseCase,
    @Inject(MarkInvoicePaidUseCase) private readonly markPaid: MarkInvoicePaidUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get("pricing-rules")
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: "List pricing rules with their summary figures" })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiOkResponse()
  async pricingRules(@Req() req: FleetRequestContext, @Query("query") query?: string) {
    const data = await this.listRules.execute(this.tenantIdFromRequest(req), query);
    return { status: true, message: "success", data };
  }

  @Post("pricing-rules")
  @Roles(...WRITE_ROLES)
  @ApiOperation({
    summary: "Create a pricing rule",
    description:
      "Rules are effective-dated. A waybill prices against the rule in force on the waybill's own date, not today's.",
  })
  @ApiOkResponse()
  async createPricingRule(@Body() body: SavePricingRuleDto, @Req() req: FleetRequestContext) {
    return this.upsertRule(body, req);
  }

  @Put("pricing-rules/:id")
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: "Update a pricing rule" })
  @ApiOkResponse()
  async updatePricingRule(
    @Param("id") id: string,
    @Body() body: SavePricingRuleDto,
    @Req() req: FleetRequestContext,
  ) {
    return this.upsertRule(body, req, id);
  }

  @Delete("pricing-rules/:id")
  @Roles(...WRITE_ROLES)
  @ApiOperation({
    summary: "Deactivate a pricing rule",
    description:
      "Stops the rule pricing anything new. Waybills it already priced keep the amount they were priced at.",
  })
  @ApiOkResponse()
  async deactivatePricingRule(@Param("id") id: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const rule = await this.runFleetUseCase(() => this.deactivateRule.execute({ id, tenantId }));

    await this.recordActivity(req, {
      entityType: "waybill",
      entityId: rule.id,
      action: "pricing_rule_deactivated",
      summary: `Deactivated pricing rule ${rule.name}`,
    });

    return { status: true, message: "success", data: toPricingRuleRow(rule) };
  }

  @Get("settings")
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: "Invoice settings printed on every invoice" })
  @ApiOkResponse()
  async invoiceSettings(@Req() req: FleetRequestContext) {
    const data = await this.getSettings.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Put("settings")
  @Roles(...WRITE_ROLES)
  @ApiOperation({
    summary: "Save invoice settings",
    description:
      "These are copied onto an invoice when it is issued, so changing them later cannot alter an invoice already sent.",
  })
  @ApiOkResponse()
  async saveInvoiceSettings(
    @Body() body: SaveInvoiceSettingsDto,
    @Req() req: FleetRequestContext,
  ) {
    const data = await this.runFleetUseCase(() =>
      this.saveSettings.execute({ ...body, tenantId: this.tenantIdFromRequest(req) }),
    );
    return { status: true, message: "success", data };
  }

  @Get("invoices")
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: "List customer invoices" })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: INVOICE_STATUSES })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiOkResponse()
  async invoices(
    @Req() req: FleetRequestContext,
    @Query("query") query?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const data = await this.listInvoices.execute({
      tenantId: this.tenantIdFromRequest(req),
      query,
      status: status as never,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return { status: true, message: "success", data };
  }

  @Post("invoices")
  @Roles(...WRITE_ROLES)
  @ApiOperation({
    summary: "Generate a draft invoice from priced waybills",
    description:
      "The draft takes a draft number. The real, gapless number is taken at approval, so binning a draft leaves no hole in the sequence.",
  })
  @ApiOkResponse()
  async generateInvoice(@Body() body: GenerateInvoiceDto, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const invoice = await this.runFleetUseCase(() =>
      this.generate.execute({ tenantId, waybillIds: body.waybillIds }),
    );

    await this.recordActivity(req, {
      entityType: "waybill",
      entityId: invoice.id,
      action: "invoice_generated",
      summary: `Drafted invoice ${invoice.invoiceNumber} for ${invoice.customerName}`,
      metadata: { waybills: body.waybillIds.length, totalKobo: invoice.totalKobo },
    });

    return { status: true, message: "success", data: toInvoiceRow(invoice) };
  }

  @Patch("invoices/:id/approve")
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: "Approve a draft and give it its real invoice number" })
  @ApiOkResponse()
  async approveInvoice(@Param("id") id: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const invoice = await this.runFleetUseCase(() =>
      this.approve.execute({ invoiceId: id, tenantId }),
    );

    await this.recordActivity(req, {
      entityType: "waybill",
      entityId: invoice.id,
      action: "invoice_approved",
      summary: `Approved invoice ${invoice.invoiceNumber}`,
    });

    return { status: true, message: "success", data: toInvoiceRow(invoice) };
  }

  @Patch("invoices/:id/send")
  @Roles(...WRITE_ROLES)
  @ApiOperation({
    summary: "Record an invoice as sent",
    description: "Defaults to the address the waybill arrived from.",
  })
  @ApiOkResponse()
  async sendInvoice(
    @Param("id") id: string,
    @Body() body: SendInvoiceDto,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const invoice = await this.runFleetUseCase(() =>
      this.send.execute({ invoiceId: id, tenantId, to: body.to }),
    );

    await this.recordActivity(req, {
      entityType: "waybill",
      entityId: invoice.id,
      action: "invoice_sent",
      summary: `Sent invoice ${invoice.invoiceNumber} to ${invoice.sentTo}`,
    });

    return { status: true, message: "success", data: toInvoiceRow(invoice) };
  }

  @Patch("invoices/:id/paid")
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: "Mark an invoice paid" })
  @ApiOkResponse()
  async markInvoicePaid(
    @Param("id") id: string,
    @Body() body: MarkInvoicePaidDto,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const invoice = await this.runFleetUseCase(() =>
      this.markPaid.execute({
        invoiceId: id,
        tenantId,
        paidAt: body.paidAt,
        reference: body.reference ?? null,
      }),
    );

    await this.recordActivity(req, {
      entityType: "waybill",
      entityId: invoice.id,
      action: "invoice_paid",
      summary: `Invoice ${invoice.invoiceNumber} marked paid`,
      metadata: { reference: invoice.paymentReference },
    });

    return { status: true, message: "success", data: toInvoiceRow(invoice) };
  }

  private async upsertRule(
    body: SavePricingRuleDto,
    req: FleetRequestContext,
    id?: string,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const rule = await this.runFleetUseCase(() =>
      this.saveRule.execute({
        tenantId,
        id,
        name: body.name,
        origin: body.origin,
        destination: body.destination,
        destinationAliases: body.destinationAliases,
        mode: body.mode,
        flatPriceKobo: toKobo(body.flatPrice),
        pricePerUnitKobo: toKobo(body.pricePerUnit),
        unitType: body.unitType,
        minimumChargeKobo: toKobo(body.minimumCharge),
        vehicleType: body.vehicleType,
        customerName: body.customerName,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo,
      }),
    );

    await this.recordActivity(req, {
      entityType: "waybill",
      entityId: rule.id,
      action: id ? "pricing_rule_updated" : "pricing_rule_created",
      summary: `${id ? "Updated" : "Created"} pricing rule ${rule.name}`,
    });

    return { status: true, message: "success", data: toPricingRuleRow(rule) };
  }
}
