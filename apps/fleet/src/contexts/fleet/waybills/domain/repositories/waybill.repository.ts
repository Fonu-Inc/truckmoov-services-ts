import type { Waybill, WaybillStatus } from "../entities/waybill.entity";

export type WaybillFilters = {
  tenantId: string;
  status?: WaybillStatus;
  /** Matches waybill number, destination, vehicle registration or customer name. */
  query?: string;
  customerName?: string;
  dateFrom?: string;
  dateTo?: string;
  /** registrationKey()s of the vehicles the caller may see. Null or absent means every vehicle. */
  registrationKeys?: ReadonlySet<string> | null;
  limit?: number;
  offset?: number;
};

export type WaybillPage = {
  items: Waybill[];
  /** Total matching the filter, not the page. The screen pages independently of its summary figures. */
  total: number;
};

export interface WaybillRepository {
  save(waybill: Waybill): Promise<void>;
  findById(id: string, tenantId: string): Promise<Waybill | null>;
  findByNumber(waybillNumber: string, tenantId: string): Promise<Waybill | null>;
  search(filters: WaybillFilters): Promise<WaybillPage>;
  /** Counts per status for the summary figures, which must not be derived from a page. */
  countByStatus(
    tenantId: string,
    registrationKeys?: ReadonlySet<string> | null,
  ): Promise<Record<WaybillStatus, number>>;
  /**
   * Waybills still pending from before a cutoff, across every tenant. The stall
   * sweep runs platform-wide, so this deliberately takes no tenant.
   */
  findPendingCapturedBefore(cutoff: Date, limit: number): Promise<Waybill[]>;
}

export const WAYBILL_REPOSITORY = Symbol("WAYBILL_REPOSITORY");
