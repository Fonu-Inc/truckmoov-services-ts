export const ONBOARDING_VERIFICATION_CODE_SUBJECT =
  'Your verification code — TruckMoov';

export const ONBOARDING_VERIFICATION_CODE_TEMPLATE = `
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
    .code { text-align: center; margin: 32px 0; font-size: 34px; font-weight: 700; letter-spacing: 10px; color: #1a1a2e; }
    .footer { padding: 24px 32px; text-align: center; color: #aaa; font-size: 12px; border-top: 1px solid #eee; background: #fafafa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>TruckMoov</h1>
    </div>
    <div class="body">
      <h2>Verify your email</h2>
      <p>Use this code to continue your Fleet Pro application for {{organizationName}}.</p>
      <div class="code">{{code}}</div>
      <p>The code expires in {{expiryMinutes}} minutes. If you did not start an application, ignore this email.</p>
    </div>
    <div class="footer">© {{year}} TruckMoov. All rights reserved.</div>
  </div>
</body>
</html>
`;
