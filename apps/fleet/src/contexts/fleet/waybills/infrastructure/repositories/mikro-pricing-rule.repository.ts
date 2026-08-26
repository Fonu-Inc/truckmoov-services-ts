import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import {
  PricingRule,
  isPricingMode,
} from "../../domain/entities/pricing-rule.entity";
import type { PricingRuleRepository } from "../../domain/repositories/pricing-rule.repository";
import {
  PricingRuleRecord,
  getFleetOrm,
} from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroPricingRuleRepository implements PricingRuleRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(rule: PricingRule): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    await orm.em.fork().upsert(PricingRuleRecord, {
      id: rule.id,
      tenantId: rule.tenantId,
      name: rule.name,
      origin: rule.origin,
      destination: rule.destination,
      destinationAliases: rule.destinationAliases,
      mode: rule.mode,
      currency: rule.currency,
      flatPriceKobo: rule.flatPriceKobo,
      pricePerUnitKobo: rule.pricePerUnitKobo,
      unitType: rule.unitType,
      minimumChargeKobo: rule.minimumChargeKobo,
      vehicleType: rule.vehicleType,
      customerName: rule.customerName,
      effectiveFrom: rule.effectiveFrom ? new Date(rule.effectiveFrom) : null,
      effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo) : null,
      active: rule.active,
      createdAt: new Date(rule.createdAt),
      updatedAt: new Date(rule.updatedAt),
    });
  }

  async findById(id: string, tenantId: string): Promise<PricingRule | null> {
    const orm = await getFleetOrm(this.config.db);
    const record = await orm.em.fork().findOne(PricingRuleRecord, { id, tenantId });
    return record ? toDomain(record) : null;
  }

  async findAll(tenantId: string): Promise<PricingRule[]> {
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em
      .fork()
      .find(PricingRuleRecord, { tenantId }, { orderBy: { createdAt: "desc" } });
    return records.map(toDomain);
  }

  async findActive(tenantId: string): Promise<PricingRule[]> {
    const orm = await getFleetOrm(this.config.db);
    const records = await orm.em
      .fork()
      .find(PricingRuleRecord, { tenantId, active: true }, { orderBy: { createdAt: "desc" } });
    return records.map(toDomain);
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    await orm.em.fork().nativeDelete(PricingRuleRecord, { id, tenantId });
  }
}

function toDomain(record: PricingRuleRecord): PricingRule {
  return PricingRule.create({
    id: record.id,
    tenantId: record.tenantId,
    name: record.name,
    origin: record.origin ?? null,
    destination: record.destination,
    destinationAliases: (record.destinationAliases as string[] | null) ?? [],
    mode: isPricingMode(record.mode) ? record.mode : "flat",
    currency: record.currency ?? "NGN",
    flatPriceKobo: toNumberOrNull(record.flatPriceKobo),
    pricePerUnitKobo: toNumberOrNull(record.pricePerUnitKobo),
    unitType: record.unitType ?? null,
    minimumChargeKobo: toNumberOrNull(record.minimumChargeKobo),
    vehicleType: record.vehicleType ?? null,
    customerName: record.customerName ?? null,
    effectiveFrom: record.effectiveFrom ? toDateOnly(record.effectiveFrom) : null,
    effectiveTo: record.effectiveTo ? toDateOnly(record.effectiveTo) : null,
    active: record.active,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
