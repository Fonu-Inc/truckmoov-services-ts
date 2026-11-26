import { Inject, Injectable } from "@nestjs/common";
import { MailerService } from "@shared/mailer";
import { COMPLIANCE_DOCUMENT_REPOSITORY, type ComplianceDocumentRepository, type StoredComplianceDocument } from "./compliance-document.repository";
import { VEHICLE_REPOSITORY } from "./contexts/fleet/vehicles";
import type { VehicleRepository } from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import { lagosDayOffset, lagosToday } from "./utils/lagos-date";

export const DEFAULT_COMPLIANCE_LEAD_DAYS = 30;

/**
 * The Send Reminders button: one tenant's documents expiring within the window
 * the user picked, or already expired, mailed to the address they typed. The
 * periodic sweep is separate and still announces every tenant to all its users.
 */
@Injectable()
export class ComplianceReminderSendService {
  constructor(
    @Inject(COMPLIANCE_DOCUMENT_REPOSITORY) private readonly documents: ComplianceDocumentRepository,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    @Inject(MailerService) private readonly mailer: MailerService,
  ) {}

  async send(
    tenantId: string,
    recipientEmail: string,
    leadDays: number,
    vehicleIds?: string[],
    now: Date = new Date(),
  ): Promise<{ queued: number; recipient: string }> {
    const due = await this.documents.findAllByTenant(tenantId, { expiryDateTo: cutoff(now, leadDays), vehicleIds });
    const expiring = due.filter((doc) => doc.expiryDate);
    if (expiring.length > 0) {
      await this.mailer.send({
        to: recipientEmail,
        subject: `${expiring.length} compliance document(s) need attention — FleetPro`,
        template: COMPLIANCE_REMINDER_TEMPLATE,
        variables: {
          leadDays: String(leadDays),
          dueCount: String(expiring.length),
          rows: (await this.rows(tenantId, expiring, now)).join(""),
          year: String(now.getFullYear()),
        },
      });
    }
    return { queued: expiring.length, recipient: recipientEmail };
  }

  private async rows(tenantId: string, docs: StoredComplianceDocument[], now: Date): Promise<string[]> {
    const plates = new Map<string, string>();
    for (const id of new Set(docs.map((doc) => doc.vehicleId).filter((v): v is string => !!v))) {
      const vehicle = await this.vehicles.findById(id, tenantId);
      if (vehicle) plates.set(id, vehicle.plateNumber);
    }
    const today = lagosToday(now);
    return docs.map((doc) => {
      const vehicle = doc.vehicleId ? (plates.get(doc.vehicleId) ?? doc.vehicleId) : "—";
      const when = doc.expiryDate! < today ? `expired ${doc.expiryDate}` : `expires ${doc.expiryDate}`;
      return `<tr><td>${escapeHtml(vehicle)}</td><td>${escapeHtml(doc.documentName)}</td><td>${escapeHtml(doc.documentType)}</td><td>${when}</td></tr>`;
    });
  }
}

function cutoff(now: Date, leadDays: number): string {
  return lagosDayOffset(leadDays, now);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const COMPLIANCE_REMINDER_TEMPLATE = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f5f5f5; margin:0; padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background:#1a1a2e;padding:24px;text-align:center;"><h1 style="color:#f5c518;margin:0;font-size:22px;">FleetPro</h1></div>
    <div style="padding:28px;color:#333;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">Compliance documents expiring</h2>
      <p style="color:#555;font-size:15px;">{{dueCount}} document(s) expire within {{leadDays}} days, or already have.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="text-align:left;color:#888;"><th>Vehicle</th><th>Document</th><th>Type</th><th>When</th></tr></thead>
        <tbody>{{rows}}</tbody>
      </table>
    </div>
    <div style="padding:18px;text-align:center;color:#aaa;font-size:12px;background:#fafafa;">© {{year}} FleetPro</div>
  </div>
</body>
</html>
`;
