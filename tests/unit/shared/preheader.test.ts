import { describe, expect, it } from 'vitest';
import { preheader } from '@shared/mailer';
import {
  APPLICATION_PAYMENT_OPEN_TEMPLATE,
  NEW_APPLICATION_ALERT_TEMPLATE,
} from '../../../apps/auth/src/templates/onboarding-application-decision.template';
import { VERIFY_EMAIL_TEMPLATE } from '../../../apps/auth/src/templates/verify-email.template';

describe('preheader', () => {
  it('is hidden and carries the text', () => {
    const html = preheader('Hello there');
    expect(html).toContain('display:none');
    expect(html).toContain('max-height:0');
    expect(html).toContain('mso-hide:all');
    expect(html).toContain('Hello there');
  });

  it.each([
    ['payment open', APPLICATION_PAYMENT_OPEN_TEMPLATE],
    ['new application', NEW_APPLICATION_ALERT_TEMPLATE],
    ['verify email', VERIFY_EMAIL_TEMPLATE],
  ])('%s template starts its body with the preheader', (_name, template) => {
    expect(template).toMatch(/<body[^>]*>\s*<div style="display:none/);
  });
});
