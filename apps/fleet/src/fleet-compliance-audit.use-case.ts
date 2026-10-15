import { Inject, Injectable } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";
import { statusFromExpiry } from "./compliance-document.repository";
import { ComplianceDocumentsUseCase } from "./compliance-documents.use-case";
import { ComplianceReminderWindowService } from "./compliance-reminder-window.service";
import { DRIVER_REPOSITORY, type DriverRepository } from "./contexts/fleet/drivers/domain/repositories/driver.repository";
import { ownedDriverIdsFrom } from "./contexts/fleet/drivers/domain/driver-roster";
import type { AnalyticsRange } from "./contexts/fleet/reports/domain/analytics-range";
import {
  buildAuditActivity,
  buildCategoryRows,
  buildComplianceTotals,
  type ComplianceItem,
} from "./contexts/fleet/reports/domain/compliance-audit";
import { lagosDayOffset } from "./utils/lagos-date";

type AllowedVehicleIds = ReadonlySet<string> | null | undefined;

const SOON_DAYS = 30;
const ACTIVITY_LIMIT = 2000;
export const DRIVER_LICENCE_CATEGORY = "Driver Licences";

function isoDay(offsetDays: number): string {
  return lagosDayOffset(offsetDays);
}

@Injectable()
export class FleetComplianceAuditUseCase {
  constructor(
    @Inject(ComplianceDocumentsUseCase) private readonly documents: ComplianceDocumentsUseCase,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(ComplianceReminderWindowService) private readonly reminderWindow: ComplianceReminderWindowService,
  ) {}

  /**
   * Current compliance documents plus driver licences, as of today, and the
   * audit activity inside the range. Activity is the whole tenant's log, so the
   * caller passes includeActivity only for roles that may read it.
   */
  async report(tenantId: string, range: AnalyticsRange, allowed: AllowedVehicleIds, includeActivity: boolean) {
    const [docs, drivers, activity] = await Promise.all([
      this.documents.list(tenantId, allowed ? { vehicleIds: [...allowed] } : undefined),
      this.driverRepo.findAll({ tenantId }),
      includeActivity
        ? this.auditLog.query(tenantId, { from: range.from, to: range.to, limit: ACTIVITY_LIMIT })
        : Promise.resolve(null),
    ]);
    const ownedDrivers = allowed ? ownedDriverIdsFrom(allowed, drivers) : null;
    const visibleDrivers = (ownedDrivers ? drivers.filter((d) => ownedDrivers.has(d.id)) : drivers).map((driver) => ({
      expiry: driver.licenseExpiryDate ? driver.licenseExpiryDate.slice(0, 10) : null,
    }));
    const items: ComplianceItem[] = [
      ...docs.map((doc) => ({ category: doc.documentType, status: doc.status, vehicleId: doc.vehicleId })),
      ...visibleDrivers.map((driver) => ({
        category: DRIVER_LICENCE_CATEGORY,
        status: driver.expiry ? statusFromExpiry(driver.expiry, this.reminderWindow.reminderDays) : ("missing" as const),
      })),
    ];
    const today = isoDay(0);
    const soon = isoDay(SOON_DAYS);
    return {
      from: range.from,
      to: range.to,
      summary: {
        ...buildComplianceTotals(items),
        expiringIn30Days:
          docs.filter((doc) => doc.expiryDate && doc.expiryDate >= today && doc.expiryDate <= soon).length +
          visibleDrivers.filter((d) => d.expiry && d.expiry >= today && d.expiry <= soon).length,
        nonCompliantVehicles: new Set(docs.filter((doc) => doc.status === "expired" && doc.vehicleId).map((doc) => doc.vehicleId)).size,
      },
      categories: buildCategoryRows(items),
      activity: activity ? buildAuditActivity(activity, ACTIVITY_LIMIT) : null,
    };
  }
}
