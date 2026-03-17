import { Inject, Injectable } from "@nestjs/common";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { InvalidVerificationTokenError } from "../../domain/errors/invalid-verification-token.error";

export type VerifyEmailCommand = { token: string };

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<{ message: string }> {
    const user = await this.userRepo.findByVerificationToken(command.token);
    if (!user) throw new InvalidVerificationTokenError();

    await this.userRepo.save({ ...user, emailVerificationToken: null });

    return { message: "Email verified successfully" };
  }
}
