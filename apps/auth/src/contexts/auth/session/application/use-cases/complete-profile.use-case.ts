import { Inject, Injectable } from "@nestjs/common";
import { PASSWORD_HASHER, type PasswordHasher } from "@auth/session/domain/ports/password-hasher.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { InvalidVerificationTokenError } from "../../domain/errors/invalid-verification-token.error";

export type CompleteProfileCommand = {
  token: string;
  fullName: string;
  password: string;
};

@Injectable()
export class CompleteProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(command: CompleteProfileCommand): Promise<{ message: string }> {
    const user = await this.userRepo.findByVerificationToken(command.token);
    if (!user) throw new InvalidVerificationTokenError();

    const passwordHash = await this.passwordHasher.hash(command.password);

    await this.userRepo.save({
      ...user,
      passwordHash,
      emailVerificationToken: null,
      profile: {
        ...user.profile,
        fullName: command.fullName.trim(),
        phoneNumber: user.profile?.phoneNumber ?? null,
        address: user.profile?.address ?? null,
        profilePictureUrl: user.profile?.profilePictureUrl ?? null,
      },
    });

    return { message: "Profile completed successfully" };
  }
}
