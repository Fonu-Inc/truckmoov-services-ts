const SHELL_STYLES = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1a1a2e; padding: 32px; text-align: center; }
    .header h1 { color: #f5c518; margin: 0; font-size: 24px; letter-spacing: 0.5px; }
    .body { padding: 40px 32px; color: #333; line-height: 1.7; }
    .body h2 { margin: 0 0 16px; font-size: 20px; color: #1a1a2e; }
    .body p { margin: 0 0 16px; font-size: 15px; color: #555; }
    .reason { margin: 24px 0; padding: 16px 20px; background: #fafafa; border-left: 3px solid #f5c518; font-size: 15px; color: #444; }
    .meta { font-size: 13px; color: #888; }
    .btn-wrap { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; padding: 14px 40px; background: #f5c518; color: #1a1a2e; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px; }
    .fallback { font-size: 13px; color: #888; word-break: break-all; }
    .footer { padding: 24px 32px; text-align: center; color: #aaa; font-size: 12px; border-top: 1px solid #eee; background: #fafafa; }
`;

export const APPLICATION_REJECTED_SUBJECT =
  'Your FleetPro application was not approved';

export const APPLICATION_REJECTED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${SHELL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>FleetPro</h1></div>
    <div class="body">
      <h2>Your application was not approved</h2>
      <p>We reviewed the FleetPro application for {{organizationName}} and cannot approve it at this time.</p>
      <div class="reason">{{reason}}</div>
      <p>No account has been created and the application is now closed. You can apply again with the same email address once the points above are resolved.</p>
      <div class="btn-wrap"><a class="btn" href="{{applyLink}}">Start a new application</a></div>
      <p class="fallback">{{applyLink}}</p>
      <p class="meta">Application reference: {{reference}}</p>
      <p class="meta">If you believe this decision is wrong, reply to this email and our team will look again.</p>
    </div>
    <div class="footer">© {{year}} FleetPro. All rights reserved.</div>
  </div>
</body>
</html>
`;

export const APPLICATION_CHANGES_REQUESTED_SUBJECT =
  'Action needed on your FleetPro application';

export const APPLICATION_CHANGES_REQUESTED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${SHELL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>FleetPro</h1></div>
    <div class="body">
      <h2>We need something corrected</h2>
      <p>Your FleetPro application for {{organizationName}} is almost there. Our reviewers asked for the following:</p>
      <div class="reason">{{reason}}</div>
      <p>Open your application to replace the documents concerned and submit it again. Nothing else needs redoing.</p>
      <div class="btn-wrap"><a class="btn" href="{{resumeLink}}">Continue your application</a></div>
      <p class="fallback">{{resumeLink}}</p>
      <p class="meta">Application reference: {{reference}}</p>
    </div>
    <div class="footer">© {{year}} FleetPro. All rights reserved.</div>
  </div>
</body>
</html>
`;

export const APPLICATION_RESUME_SUBJECT =
  'Continue your FleetPro application';

export const APPLICATION_RESUME_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${SHELL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>FleetPro</h1></div>
    <div class="body">
      <h2>Pick up where you left off</h2>
      <p>Here is the link back into the FleetPro application for {{organizationName}}. It opens the application exactly as you left it.</p>
      <div class="btn-wrap"><a class="btn" href="{{resumeLink}}">Continue my application</a></div>
      <p class="fallback">{{resumeLink}}</p>
      <p>This link replaces any earlier one, so older links no longer work. It is as good as a password: anyone holding it can see and change your application.</p>
      <p class="meta">Application reference: {{reference}}</p>
    </div>
    <div class="footer">© {{year}} FleetPro. All rights reserved.</div>
  </div>
</body>
</html>
`;

export const NEW_APPLICATION_ALERT_SUBJECT =
  'New FleetPro application';

export const NEW_APPLICATION_ALERT_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${SHELL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>FleetPro</h1></div>
    <div class="body">
      <h2>{{organizationName}} has applied</h2>
      <p>A new {{applicantType}} application is in the onboarding queue.</p>
      <div class="reason">
        Automated checks: {{automatedOutcome}}<br />
        Fleet: {{vehicleCount}} vehicle(s), {{deviceCount}} device(s) requested
      </div>
      <p class="meta">Application reference: {{reference}}</p>
    </div>
    <div class="footer">© {{year}} FleetPro. All rights reserved.</div>
  </div>
</body>
</html>
`;

export const APPLICATION_PAYMENT_OPEN_SUBJECT =
  'Your FleetPro application is ready for payment';

export const APPLICATION_PAYMENT_OPEN_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${SHELL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>FleetPro</h1></div>
    <div class="body">
      <h2>You can pay now</h2>
      <p>Good news: the devices for {{organizationName}} are ready and your FleetPro application is waiting for payment. Pay to move on to booking your installation.</p>
      <div class="btn-wrap"><a class="btn" href="{{resumeLink}}">Continue to payment</a></div>
      <p class="fallback">{{resumeLink}}</p>
      <p>This link replaces any earlier one, so older links no longer work. It is as good as a password: anyone holding it can see and change your application.</p>
      <p class="meta">Application reference: {{reference}}</p>
    </div>
    <div class="footer">© {{year}} FleetPro. All rights reserved.</div>
  </div>
</body>
</html>
`;

export const APPLICATION_PAYMENT_REFUNDED_SUBJECT =
  'Your payment has been refunded — FleetPro';

export const APPLICATION_PAYMENT_REFUNDED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${SHELL_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>FleetPro</h1></div>
    <div class="body">
      <h2>Your payment is being refunded</h2>
      <p>The payment we received for the FleetPro application for {{organizationName}} did not match the amount due, so we have refunded it. Your bank can take a few working days to show the money.</p>
      <div class="btn-wrap"><a class="btn" href="{{resumeLink}}">Open my application</a></div>
      <p class="fallback">{{resumeLink}}</p>
      <p>To go ahead, open your application and pay the amount shown there. This link replaces any earlier one.</p>
      <p class="meta">Application reference: {{reference}}</p>
    </div>
    <div class="footer">© {{year}} FleetPro. All rights reserved.</div>
  </div>
</body>
</html>
`;
