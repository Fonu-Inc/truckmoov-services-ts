import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';

export const TAKEN_EMAIL_SOURCE = Symbol('TAKEN_EMAIL_SOURCE');

export interface TakenEmailSource {
  /** Lower-cased emails of accounts and applications touched at or after `since`; all of them when null. */
  since(since: Date | null): Promise<string[]>;
}

@Injectable()
export class MikroTakenEmailSource implements TakenEmailSource {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async since(since: Date | null): Promise<string[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ email: string }>>(
      `select lower(email) as email from auth_users where (?::timestamptz is null or created_at >= ?)
       union
       select lower(business_email) as email from onboarding_applications where (?::timestamptz is null or updated_at >= ?)`,
      [since, since, since, since],
    );
    return rows.map((row) => row.email);
  }
}
