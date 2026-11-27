import { preheader } from '@shared/mailer';

export const FORGOT_PASSWORD_SUBJECT = "Reset your FleetPro password";

export const FORGOT_PASSWORD_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 32px; text-align: center; }
    .header h1 { color: #f5c518; margin: 0; font-size: 24px; }
    .body { padding: 32px; color: #333; line-height: 1.6; }
    .btn { display: inline-block; padding: 14px 32px; background: #f5c518; color: #1a1a2e; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 24px 0; }
    .footer { padding: 24px 32px; text-align: center; color: #999; font-size: 13px; border-top: 1px solid #eee; }
  </style>
</head>
<body>${preheader('Use the link inside to choose a new password. It expires in 1 hour.')}
  <div class="container">
    <div class="header">
      <h1>FleetPro</h1>
    </div>
    <div class="body">
      <p>Hello,</p>
      <p>We received a request to reset your password. Click the button below to proceed:</p>
      <p style="text-align:center;">
        <a href="{{resetLink}}" class="btn">Reset Password</a>
      </p>
      <p>This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      &copy; {{year}} FleetPro. All rights reserved.
    </div>
  </div>
</body>
</html>
`;

export const FORGOT_PASSWORD_SMS_TEMPLATE =
  "Your TruckMoov password reset code is: {{code}}. It expires in 10 minutes.";
