import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  USER_REPOSITORY,
  type DispatcherPreferences,
  type UserRepository,
} from "../../domain/ports/user-repository.port";
import { resolveActorUser } from "./support/resolve-actor-user";
import {
  assertValidShiftRange,
  assertValidTimezone,
  assertValidWorkDays,
} from "./support/settings-validation";

export type UpdateDispatcherPreferencesCommand = {
  accessToken: string;
  timezone?: string;
  shiftStart?: string;
  shiftEnd?: string;
  workDays?: number[];
};

@Injectable()
export class UpdateDispatcherPreferencesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(command: UpdateDispatcherPreferencesCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepo,
    );

    if (actor.role !== Role.DISPATCHER) {
      throw new ForbiddenError(
        "Only dispatchers can update working hours and timezone settings",
      );
    }

    const current = actor.dispatcherPreferences!;
    const merged: DispatcherPreferences = {
      timezone: command.timezone ?? current.timezone,
      shiftStart: command.shiftStart ?? current.shiftStart,
      shiftEnd: command.shiftEnd ?? current.shiftEnd,
      workDays: command.workDays ?? current.workDays,
    };

    assertValidTimezone(merged.timezone);
    assertValidShiftRange(merged.shiftStart, merged.shiftEnd);
    assertValidWorkDays(merged.workDays);

    await this.userRepo.updateDispatcherPreferences(actor.id, merged);

    return {
      userId: actor.id,
      dispatcherPreferences: merged,
    };
  }
}
