import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  INDEMNITY_AGREEMENT_REPOSITORY,
  type IndemnityAgreementRepository,
} from '@auth/onboarding/domain/indemnity-agreement.repository';
import { INDEMNITY_TEMPLATE_V1 } from './indemnity-template-v1';

@Injectable()
export class IndemnityTemplateBootstrapService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(IndemnityTemplateBootstrapService.name);

  constructor(
    @Inject(INDEMNITY_AGREEMENT_REPOSITORY)
    private readonly agreements: IndemnityAgreementRepository,
  ) {}

  /**
   * Publishes a version once and never rewrites it.
   *
   * Signatures record the version and the hash of the wording, so editing a
   * published template in place would break the only evidence of what was
   * agreed. New wording is a new version.
   */
  async onApplicationBootstrap(): Promise<void> {
    const { version, title, body } = INDEMNITY_TEMPLATE_V1;
    if (await this.agreements.findTemplateByVersion(version)) return;

    await this.agreements.saveTemplate({
      id: `indemnity-template-${version}`,
      version,
      title,
      body,
      bodyHash: createHash('sha256').update(body).digest('hex'),
      isActive: true,
      createdAt: new Date(),
    });
    this.logger.log(`Published indemnity agreement ${version}`);
  }
}
