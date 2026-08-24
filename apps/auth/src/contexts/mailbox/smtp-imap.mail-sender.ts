import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { isPubliclyRoutableHost } from '@shared/http';
import type { MailAddress } from './mailbox.domain';
import { UnsafeMailboxHostError } from './imap-mailbox.reader';
import type { MailboxSender, SendOutcome, SendRequest } from './mailbox-sender.port';

@Injectable()
export class SmtpImapMailSender implements MailboxSender {
  private readonly logger = new Logger(SmtpImapMailSender.name);

  async send(request: SendRequest): Promise<SendOutcome> {
    // Re-checked at connect time. The credential passed this when it was saved,
    // but DNS can be repointed at a private address in between.
    for (const host of [request.smtp.host, request.imap.host]) {
      if (!isPubliclyRoutableHost(host)) throw new UnsafeMailboxHostError(host);
    }

    // Composed once. The bytes handed to SMTP and the bytes filed to Sent are
    // the same bytes: composing twice would produce a different Message-ID and
    // different MIME boundaries, and the filed copy would no longer be the
    // message that was actually delivered — nor match a bounce against it.
    const raw = await this.compose(request);

    await this.transmit(request, raw);

    // Only reached once the relay has accepted. If filing now fails the message
    // is already gone, so the caller must retry the filing alone and never the
    // send: a retried send delivers the message twice.
    try {
      await this.fileToSent(request, raw);
      return { messageId: request.messageId, accepted: true, filedToSent: true, filingError: null };
    } catch (error) {
      const filingError = error instanceof Error ? error.message : 'append to sent failed';
      this.logger.error(`mail_append_failed:${request.messageId}:${filingError}`);
      return { messageId: request.messageId, accepted: true, filedToSent: false, filingError };
    }
  }

  private async compose(request: SendRequest): Promise<Buffer> {
    return new MailComposer({
      from: toNodemailerAddress(request.from),
      to: request.to.map(toNodemailerAddress),
      cc: request.cc.map(toNodemailerAddress),
      bcc: request.bcc.map(toNodemailerAddress),
      subject: request.subject,
      text: request.bodyText ?? undefined,
      html: request.bodyHtml ?? undefined,
      attachments: request.attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: attachment.content,
      })),
      messageId: request.messageId,
      inReplyTo: request.inReplyTo ?? undefined,
      // Without these two headers the recipient's client shows a reply as a new
      // conversation, however well we thread it on our own side.
      references: request.references.length > 0 ? request.references : undefined,
    })
      .compile()
      .build();
  }

  private async transmit(request: SendRequest, raw: Buffer): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: request.smtp.host,
      port: request.smtp.port,
      secure: request.smtp.secure,
      auth: { user: request.smtp.username, pass: request.smtp.password },
    });

    try {
      // raw, not the structured fields: this sends exactly what was composed.
      // The envelope is stated explicitly so bcc recipients are addressed
      // without the header being present in the delivered message.
      await transporter.sendMail({
        envelope: {
          from: request.from.address,
          to: [...request.to, ...request.cc, ...request.bcc].map((address) => address.address),
        },
        raw,
      });
    } finally {
      transporter.close();
    }
  }

  private async fileToSent(request: SendRequest, raw: Buffer): Promise<void> {
    const client = new ImapFlow({
      host: request.imap.host,
      port: request.imap.port,
      secure: request.imap.secure,
      auth: { user: request.imap.username, pass: request.imap.password },
      logger: false,
    });

    await client.connect();
    try {
      await client.append(request.sentFolder, raw, ['\\Seen']);
    } finally {
      await client.logout().catch(() => {
        // Already filed; a failed logout must not report the filing as failed.
      });
    }
  }
}

function toNodemailerAddress(address: MailAddress) {
  return address.name ? { name: address.name, address: address.address } : address.address;
}
