import type { NoticeKind } from '@auth/onboarding/domain/enforcement-stage';

export type NoticeCopy = { subject: string; headline: string; paragraphs: string[]; showItems: boolean };

const PAUSE_SCOPE =
  'sign-in for your team, devices and vehicles on the map, SIMs and public tracking links';

export const NOTICE_COPY: Record<NoticeKind, NoticeCopy> = {
  due_today: {
    subject: 'A payment is due today',
    headline: 'A payment is due today',
    paragraphs: [
      'Hello {{customerName}}, a payment of {{amountOwedNgn}} is due today ({{dueDate}}).',
      'Please pay today to avoid any interruption. If it is not paid, you have until {{graceEndsOn}} before access is paused.',
    ],
    showItems: true,
  },
  grace_daily: {
    subject: 'Your payment is overdue: {{daysLeft}} left before access is paused',
    headline: 'Your payment is overdue',
    paragraphs: [
      'Hello {{customerName}}, we have not received {{amountOwedNgn}}, which was due on {{dueDate}}.',
      `You have {{daysLeft}} left before access is paused (${PAUSE_SCOPE}).`,
    ],
    showItems: true,
  },
  final: {
    subject: 'Last reminder: your access will be paused on {{suspendOn}} unless payment is received',
    headline: 'Last reminder',
    paragraphs: [
      'Hello {{customerName}}, we have not received {{amountOwedNgn}}, which was due on {{dueDate}}.',
      `Your access will be paused on {{suspendOn}} unless payment is received. This covers ${PAUSE_SCOPE}.`,
      'Paying restores everything automatically.',
    ],
    showItems: true,
  },
  suspended: {
    subject: 'Your account is paused. Pay to restore everything automatically.',
    headline: 'Your account is paused',
    paragraphs: [
      'Hello {{customerName}}, your account is paused because {{amountOwedNgn}}, due on {{dueDate}}, was not paid.',
      'Your users cannot sign in, your devices, vehicles and public tracking links are on hold, and your SIMs are marked as paused in FleetPro.',
      'Pay to restore everything automatically. No action is needed from you after payment.',
    ],
    showItems: true,
  },
  renewal_issued: {
    subject: 'Your licence renewal invoice {{invoiceNumber}} is ready',
    headline: 'Your licence renewal invoice is ready',
    paragraphs: [
      'Hello {{customerName}}, invoice {{invoiceNumber}} for {{amountOwedNgn}} renews your licence.',
      'It is due on {{dueDate}}. Pay from Billing in the app by {{dueDate}}.',
      'After the due date you have {{graceDays}} before the account is paused.',
    ],
    showItems: false,
  },
  restored: {
    subject: 'Thank you, your account is fully restored',
    headline: 'Your account is fully restored',
    paragraphs: [
      'Hello {{customerName}}, thank you for your payment.',
      'Your users can sign in again, and your devices, vehicles, SIMs and public tracking links are back to normal.',
    ],
    showItems: false,
  },
};

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 32px; text-align: center; }
    .header h1 { color: #f5c518; margin: 0; font-size: 24px; }
    .body { padding: 40px 32px; color: #333; line-height: 1.7; }
    .body h2 { margin: 0 0 16px; font-size: 20px; color: #1a1a2e; }
    .body p { margin: 0 0 16px; font-size: 15px; color: #555; }
    .body ul { margin: 0 0 16px; padding-left: 20px; color: #444; font-size: 15px; }
    .button { display: inline-block; background: #f5c518; color: #1a1a2e; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
    .footer { padding: 24px 32px; text-align: center; color: #aaa; font-size: 12px; border-top: 1px solid #eee; background: #fafafa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>FleetPro</h1></div>
    <div class="body">
      <h2>{{headline}}</h2>
      {{paragraphs}}
      {{itemsBlock}}
      {{payBlock}}
      <p>Questions? Write to {{supportEmail}}.</p>
    </div>
    <div class="footer">&copy; {{year}} FleetPro. All rights reserved.</div>
  </div>
</body>
</html>`;

export const ENFORCEMENT_PAGE_TEMPLATE = PAGE;
