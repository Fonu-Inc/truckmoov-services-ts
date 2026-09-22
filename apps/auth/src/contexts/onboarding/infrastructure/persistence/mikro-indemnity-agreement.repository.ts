import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  IndemnityAgreementRepository,
  StoredIndemnitySignature,
  StoredIndemnityTemplate,
} from '@auth/onboarding/domain/indemnity-agreement.repository';
import {
  IndemnitySignatureRecord,
  IndemnityTemplateRecord,
} from './onboarding-orm';

function toStoredTemplate(
  r: IndemnityTemplateRecord,
): StoredIndemnityTemplate {
  return {
    id: r.id,
    version: r.version,
    title: r.title,
    body: r.body,
    bodyHash: r.bodyHash,
    isActive: r.isActive,
    createdAt: r.createdAt,
  };
}

function toStoredSignature(
  r: IndemnitySignatureRecord,
): StoredIndemnitySignature {
  return {
    id: r.id,
    applicationId: r.applicationId,
    templateVersion: r.templateVersion,
    templateHash: r.templateHash,
    signerName: r.signerName,
    method: r.method as StoredIndemnitySignature['method'],
    fileKey: r.fileKey,
    mimeType: r.mimeType,
    ipAddress: r.ipAddress ?? null,
    userAgent: r.userAgent ?? null,
    signedAt: r.signedAt,
  };
}

@Injectable()
export class MikroIndemnityAgreementRepository
  implements IndemnityAgreementRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  async saveTemplate(template: StoredIndemnityTemplate): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(IndemnityTemplateRecord, {
      version: template.version,
    });
    const target = existing ?? new IndemnityTemplateRecord();
    Object.assign(target, template);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findTemplateByVersion(
    version: string,
  ): Promise<StoredIndemnityTemplate | null> {
    const em = await this.em();
    const record = await em.findOne(IndemnityTemplateRecord, { version });
    return record ? toStoredTemplate(record) : null;
  }

  async findActiveTemplate(): Promise<StoredIndemnityTemplate | null> {
    const em = await this.em();
    const record = await em.findOne(
      IndemnityTemplateRecord,
      { isActive: true },
      { orderBy: { createdAt: 'desc' } },
    );
    return record ? toStoredTemplate(record) : null;
  }

  async saveSignature(signature: StoredIndemnitySignature): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(IndemnitySignatureRecord, {
      applicationId: signature.applicationId,
    });
    const target = existing ?? new IndemnitySignatureRecord();
    Object.assign(target, signature);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findSignatureByApplicationId(
    applicationId: string,
  ): Promise<StoredIndemnitySignature | null> {
    const em = await this.em();
    const record = await em.findOne(IndemnitySignatureRecord, {
      applicationId,
    });
    return record ? toStoredSignature(record) : null;
  }

  async deleteSignatureByApplicationId(applicationId: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(IndemnitySignatureRecord, { applicationId });
  }
}
