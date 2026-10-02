import { Controller } from '@nestjs/common';
import { OnResource, Portals } from '@shared/access';
import { MailCredentialsController } from './mail-credentials.controller';
import { MailboxController } from './mailbox.controller';

/**
 * The platform's own mailbox, for staff in the system tenant.
 *
 * The behaviour is the tenant mailbox's: it reads, sends and configures for the
 * caller's own organisation, which for platform staff is the system tenant. Only
 * the door differs, so staff reach it through the admin portal and the
 * Messaging Center permission instead of a tenant one.
 */
@Portals('admin')
@OnResource('admin.messaging')
@Controller('system/mailbox')
export class AdminMailboxController extends MailboxController {}

@Portals('admin')
@OnResource('admin.messaging')
@Controller('system/mailbox/credentials')
export class AdminMailCredentialsController extends MailCredentialsController {}
