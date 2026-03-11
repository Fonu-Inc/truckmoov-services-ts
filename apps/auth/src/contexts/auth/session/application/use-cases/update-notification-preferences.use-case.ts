import { Inject, Injectable } from "@nestjs/common";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  USER_REPOSITORY,
  type UserRepository,
  type NotificationPreferences,
} from "../../domain/ports/user-repository.port";
import { resolveActorUser } from "./support/resolve-actor-user";

export type UpdateNotificationPreferencesCommand = {
  accessToken: string;
  emailAlerts?: boolean;
  smsAlerts?: boolean;
  pushAlerts?: boolean;
  incidentAlerts?: boolean;
  jobUpdates?: boolean;
  marketingAnnouncements?: boolean;
};

@Injectable()
export class UpdateNotificationPreferencesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(command: UpdateNotificationPreferencesCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepo,
    );

    const current = actor.notificationPreferences!;
    const merged: NotificationPreferences = {
      emailAlerts: command.emailAlerts ?? current.emailAlerts,
      smsAlerts: command.smsAlerts ?? current.smsAlerts,
      pushAlerts: command.pushAlerts ?? current.pushAlerts,
      incidentAlerts: command.incidentAlerts ?? current.incidentAlerts,
      jobUpdates: command.jobUpdates ?? current.jobUpdates,
      marketingAnnouncements:
        command.marketingAnnouncements ?? current.marketingAnnouncements,
    };

    await this.userRepo.updateNotificationPreferences(actor.id, merged);

    return {
      userId: actor.id,
      notificationPreferences: merged,
    };
  }
}
