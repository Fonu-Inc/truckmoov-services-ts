import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';
import { Portals } from '@shared/access';
import { AppConfigService } from '@shared/config';
import { MailerService } from '@shared/mailer';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import { OnboardingApplicationRateLimitGuard } from './contexts/onboarding/infrastructure/http/onboarding-application-rate-limit.guard';
import { SYSTEM_SETTINGS_REPOSITORY, type SystemSettingsRepository } from './system-settings.repository';

export class ContactEnquiryDto {
  @ApiProperty({ maxLength: 120 }) @IsString() @Length(2, 120) companyName!: string;
  @ApiProperty({ maxLength: 120 }) @IsString() @Length(2, 120) contactName!: string;
  @ApiProperty() @IsEmail() businessEmail!: string;
  @ApiProperty({ maxLength: 2000 }) @IsString() @Length(10, 2000) message!: string;
}

const SUBJECT = 'New enquiry from the website';
const TEMPLATE = `<p><strong>{{companyName}}</strong> sent a message from the FleetPro website.</p>
<p>Name: {{contactName}}<br>Email: {{businessEmail}}</p>
<p style="white-space:pre-wrap">{{message}}</p>`;

/** The visitor's text goes into an HTML email, so it is escaped first. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Stores a landing-page enquiry and emails it to the platform support address. */
@Injectable()
export class SubmitContactEnquiryUseCase {
  private readonly logger = new Logger(SubmitContactEnquiryUseCase.name);

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(SYSTEM_SETTINGS_REPOSITORY) private readonly settings: SystemSettingsRepository,
  ) {}

  async execute(input: ContactEnquiryDto): Promise<{ id: string }> {
    const enquiry = {
      id: randomUUID(),
      companyName: input.companyName.trim(),
      contactName: input.contactName.trim(),
      email: input.businessEmail.trim().toLowerCase(),
      message: input.message.trim(),
    };
    const connection = (await getAuthOrm(this.config.db)).em.fork().getConnection();
    await connection.execute(
      `insert into contact_enquiries (id, company_name, contact_name, email, message) values (?, ?, ?, ?, ?)`,
      [enquiry.id, enquiry.companyName, enquiry.contactName, enquiry.email, enquiry.message],
    );

    const to = (await this.settings.get())?.supportEmail;
    if (!to) {
      this.logger.warn(`contact_enquiry_no_support_email:${enquiry.id}`);
      return { id: enquiry.id };
    }
    try {
      await this.mailer.send({
        to,
        subject: SUBJECT,
        template: TEMPLATE,
        variables: {
          companyName: escapeHtml(enquiry.companyName),
          contactName: escapeHtml(enquiry.contactName),
          businessEmail: escapeHtml(enquiry.email),
          message: escapeHtml(enquiry.message),
        },
      });
      await connection.execute(`update contact_enquiries set emailed_at = now() where id = ?`, [enquiry.id]);
    } catch (error) {
      // The enquiry is stored; a failed email must not lose it or fail the visitor.
      this.logger.error(`contact_enquiry_email_failed:${enquiry.id}:${error instanceof Error ? error.message : 'unknown'}`);
    }
    return { id: enquiry.id };
  }
}

@ApiTags('Contact')
@Portals('public')
@Controller('contact')
@UseGuards(OnboardingApplicationRateLimitGuard)
export class ContactController {
  constructor(@Inject(SubmitContactEnquiryUseCase) private readonly submit: SubmitContactEnquiryUseCase) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a message from the website contact form', description: 'Stored, then emailed to the platform support address.' })
  @ApiOkResponse({ description: 'Received' })
  @ApiTooManyRequestsResponse({ description: 'Too many messages from this address; try again shortly' })
  async create(@Body() payload: ContactEnquiryDto) {
    return { status: true, message: 'Thanks — we will be in touch', data: await this.submit.execute(payload) };
  }
}
