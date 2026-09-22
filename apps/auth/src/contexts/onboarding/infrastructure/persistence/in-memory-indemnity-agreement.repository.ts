import { Injectable } from '@nestjs/common';
import type {
  IndemnityAgreementRepository,
  StoredIndemnitySignature,
  StoredIndemnityTemplate,
} from '@auth/onboarding/domain/indemnity-agreement.repository';

@Injectable()
export class InMemoryIndemnityAgreementRepository
  implements IndemnityAgreementRepository
{
  private readonly templates = new Map<string, StoredIndemnityTemplate>();
  private readonly signatures = new Map<string, StoredIndemnitySignature>();

  async saveTemplate(template: StoredIndemnityTemplate): Promise<void> {
    this.templates.set(template.version, { ...template });
  }

  async findTemplateByVersion(
    version: string,
  ): Promise<StoredIndemnityTemplate | null> {
    return this.templates.get(version) ?? null;
  }

  async findActiveTemplate(): Promise<StoredIndemnityTemplate | null> {
    return (
      [...this.templates.values()]
        .filter((template) => template.isActive)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async saveSignature(signature: StoredIndemnitySignature): Promise<void> {
    this.signatures.set(signature.applicationId, { ...signature });
  }

  async findSignatureByApplicationId(
    applicationId: string,
  ): Promise<StoredIndemnitySignature | null> {
    return this.signatures.get(applicationId) ?? null;
  }
}
