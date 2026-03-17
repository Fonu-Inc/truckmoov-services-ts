export const VERIFY_EMAIL_SUBJECT = "Confirm your email address — TruckMoov";

export const VERIFY_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 32px; text-align: center; }
    .header h1 { color: #f5c518; margin: 0; font-size: 24px; letter-spacing: 0.5px; }
    .body { padding: 40px 32px; color: #333; line-height: 1.7; }
    .body h2 { margin: 0 0 16px; font-size: 20px; color: #1a1a2e; }
    .body p { margin: 0 0 16px; font-size: 15px; color: #555; }
    .btn-wrap { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; padding: 14px 40px; background: #f5c518; color: #1a1a2e; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px; letter-spacing: 0.3px; }
    .divider { border: none; border-top: 1px solid #eee; margin: 24px 0; }
    .fallback { font-size: 13px; color: #888; word-break: break-all; }
    .footer { padding: 24px 32px; text-align: center; color: #aaa; font-size: 12px; border-top: 1px solid #eee; background: #fafafa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>TruckMoov</h1>
    </div>
    <div class="body">
      <h2>Welcome aboard, {{firstName}}!</h2>
      <p>
        You're almost ready to start managing your fleet with TruckMoov. Before you dive in,
        we need to verify that this email address belongs to you.
      </p>
      <p>
        Click the button below to confirm your email and activate your account. This link
        is valid for <strong>24 hours</strong>.
      </p>
      <div class="btn-wrap">
        <a href="{{verificationLink}}" class="btn">Verify Email Address</a>
      </div>
      <hr class="divider" />
      <p class="fallback">
        If the button doesn't work, copy and paste this link into your browser:<br />
        <a href="{{verificationLink}}">{{verificationLink}}</a>
      </p>
      <p style="margin-top: 24px;">
        If you didn't create a TruckMoov account, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      &copy; {{year}} TruckMoov. All rights reserved.<br />
      This email was sent to {{email}}.
    </div>
  </div>
</body>
</html>
`;
