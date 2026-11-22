import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { UpdateMaintenanceSettingsDto } from "../../../apps/fleet/src/dto/maintenance-settings.dto";
import { DEFAULT_MAINTENANCE_SETTINGS, dispatchEligibility } from "../../../apps/fleet/src/maintenance-settings.repository";
import type { StoredMaintenanceProfile } from "../../../apps/fleet/src/maintenance-profile.repository";
import { lagosDayOffset } from "../../../apps/fleet/src/utils/lagos-date";

const invalidFields = (body: object) =>
  validateSync(plainToInstance(UpdateMaintenanceSettingsDto, body)).map((error) => error.property);

const profileDue = (nextDueDate: string) => ({ nextDueDate, nextDueMileage: null, currentMileage: null }) as StoredMaintenanceProfile;

describe("maintenance settings", () => {
  it("accepts the fork's options and refuses anything else", () => {
    expect(invalidFields({ dispatchOverdueAction: "block", dispatchDueAction: "warn", warnDaysBefore: 7 })).toEqual([]);
    expect(invalidFields({ dispatchOverdueAction: "stop", dispatchDueAction: "allow", warnDaysBefore: 0 })).toEqual([
      "dispatchOverdueAction",
      "warnDaysBefore",
    ]);
    expect(invalidFields({ dispatchOverdueAction: "warn", dispatchDueAction: "allow", warnDaysBefore: 31 })).toEqual(["warnDaysBefore"]);
  });

  it("blocks or warns by the tenant's rules, with due measured by the warning period", () => {
    const overdue = profileDue(lagosDayOffset(-1));
    const dueIn5 = profileDue(lagosDayOffset(5));

    expect(dispatchEligibility(DEFAULT_MAINTENANCE_SETTINGS, [overdue, dueIn5])).toMatchObject({
      eligible: true,
      overdueCount: 1,
      dueCount: 1,
      warnings: ["Vehicle has 1 overdue maintenance item(s)"],
    });
    expect(
      dispatchEligibility({ dispatchOverdueAction: "allow", dispatchDueAction: "block", warnDaysBefore: 3 }, [dueIn5]),
    ).toMatchObject({ eligible: true, dueCount: 0 });
    expect(
      dispatchEligibility({ dispatchOverdueAction: "block", dispatchDueAction: "allow", warnDaysBefore: 7 }, [overdue]),
    ).toMatchObject({ eligible: false, blockReason: "Vehicle has 1 overdue maintenance item(s)" });
  });
});
