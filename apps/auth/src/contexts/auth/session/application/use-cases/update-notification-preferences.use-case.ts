import { Inject, Injectable } from "@nestjs/common";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  USER_REPOSITORY,
  type NotificationPreferences,
  type UserRepository,
} from "../../domain/ports/user-repository.port";
import { resolveActorUser } from "./support/resolve-actor-user";

export type UpdateNotificationPreferencesCommand = {
  accessToken: string;
  smsAlerts?: boolean;
  pushAlerts?: boolean;
  incidentAlerts?: boolean;
  jobAssignment?: boolean;
  jobCompletion?: boolean;
  maintenanceReminders?: boolean;
  fuelAlerts?: boolean;
  geofenceAlerts?: boolean;
  emailDigest?: boolean;
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
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepo);

    const current = actor.notificationPreferences!;
    const merged: NotificationPreferences = {
      smsAlerts: command.smsAlerts ?? current.smsAlerts,
      pushAlerts: command.pushAlerts ?? current.pushAlerts,
      incidentAlerts: command.incidentAlerts ?? current.incidentAlerts,
      jobAssignment: command.jobAssignment ?? current.jobAssignment,
      jobCompletion: command.jobCompletion ?? current.jobCompletion,
      maintenanceReminders: command.maintenanceReminders ?? current.maintenanceReminders,
      fuelAlerts: command.fuelAlerts ?? current.fuelAlerts,
      geofenceAlerts: command.geofenceAlerts ?? current.geofenceAlerts,
      emailDigest: command.emailDigest ?? current.emailDigest,
    };

    await this.userRepo.updateNotificationPreferences(actor.id, merged);

    return { userId: actor.id, notificationPreferences: merged };
  }
}
