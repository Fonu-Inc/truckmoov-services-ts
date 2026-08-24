import { Inject, Injectable } from "@nestjs/common";
import { AUTH_NOTIFIER, type AuthNotifier } from "@auth/session/domain/ports/auth-notifier.port";
import { ID_GENERATOR, type IdGenerator } from "@auth/session/domain/ports/id-generator.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";

export type ResendVerificationCommand = {
  email: string;
};

@Injectable()
export class ResendVerificationUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(AUTH_NOTIFIER)
    private readonly notifier: AuthNotifier,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
  ) {}

  // Always reports success. A different answer for a known and an unknown
  // address turns this endpoint into a way to enumerate accounts.
  async execute(command: ResendVerificationCommand) {
    const email = command.email.trim();
    const user = await this.userRepo.findByEmail(email);

    if (user?.emailVerificationToken) {
      const verificationToken = this.idGenerator.generate();
      await this.userRepo.save({ ...user, emailVerificationToken: verificationToken });
      await this.notifier.sendVerificationEmail({
        email: user.email,
        firstName: user.profile?.fullName?.split(" ")[0] ?? "there",
        verificationToken,
      });
    }

    return { message: "If that address needs verifying, a new link is on its way." };
  }
}
