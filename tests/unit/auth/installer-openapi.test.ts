import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA } from "@nestjs/common/constants";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { InstallerPortalController } from "../../../apps/auth/src/installer-portal.controller";
import { InstallerJobWorkController } from "../../../apps/auth/src/installer-job-work.controller";
import { InstallerJobDetailResponse, RejectedOfferResponse } from "../../../apps/auth/src/dto/installer-job-response.dto";
import { HISTORY_EXPORT_CAP } from "../../../apps/auth/src/contexts/installation/application/use-cases/support/installation-history-export";

type Documented = { type?: unknown; schema?: unknown; content?: unknown };

const DOCUMENTED: Array<[string, object, string]> = [
  ...["dashboard", "options", "list", "exportHistory", "detail"].map((name) => ["InstallerPortalController", InstallerPortalController.prototype, name] as [string, object, string]),
  ...["accept", "reject", "start", "setChecklistItem", "saveNotes", "reportIssue", "complete"].map(
    (name) => ["InstallerJobWorkController", InstallerJobWorkController.prototype, name] as [string, object, string],
  ),
];

function handler(prototype: object, name: string): object {
  return (prototype as Record<string, object>)[name];
}

function responses(prototype: object, name: string): Record<string, Documented> {
  return Reflect.getMetadata(DECORATORS.API_RESPONSE, handler(prototype, name)) ?? {};
}

const hasBody = (response?: Documented) => Boolean(response?.type ?? response?.schema ?? response?.content);

describe("Installer portal OpenAPI contract", () => {
  it.each(DOCUMENTED)("%s.%s declares its success body under the status Nest sends", (_, prototype, name) => {
    const method = Reflect.getMetadata(METHOD_METADATA, handler(prototype, name));
    const expected = method === RequestMethod.POST ? "201" : "200";
    const documented = responses(prototype, name);

    expect(Object.keys(documented).filter((status) => status.startsWith("2"))).toEqual([expected]);
    expect(hasBody(documented[expected])).toBe(true);
  });

  it.each(DOCUMENTED)("%s.%s documents 401, 403 and 404 with bodies", (_, prototype, name) => {
    const documented = responses(prototype, name);
    for (const status of ["401", "403", "404"]) expect(hasBody(documented[status])).toBe(true);
    for (const [status, response] of Object.entries(documented)) {
      if (/^[45]/.test(status)) expect(hasBody(response)).toBe(true);
    }
  });

  it("answers job changes with the job detail, and a rejection with the job id only", () => {
    expect(responses(InstallerJobWorkController.prototype, "accept")["201"]?.type).toBe(InstallerJobDetailResponse);
    expect(responses(InstallerJobWorkController.prototype, "reject")["201"]?.type).toBe(RejectedOfferResponse);
    expect(hasBody(responses(InstallerJobWorkController.prototype, "reject")["400"])).toBe(true);
    expect(hasBody(responses(InstallerJobWorkController.prototype, "reject")["409"])).toBe(true);
  });

  it("documents the history export as CSV with its cap, columns and 400", () => {
    const exported = handler(InstallerPortalController.prototype, "exportHistory");
    const operation = Reflect.getMetadata(DECORATORS.API_OPERATION, exported) as { description: string };
    const documented = responses(InstallerPortalController.prototype, "exportHistory");

    expect(Reflect.getMetadata(DECORATORS.API_PRODUCES, exported)).toEqual(["text/csv"]);
    expect(operation.description).toContain(`capped at ${HISTORY_EXPORT_CAP} rows`);
    expect((documented["200"] as { description?: string }).description).toContain("Completion Date, Completion Time, Status");
    expect(hasBody(documented["400"])).toBe(true);
  });
});
