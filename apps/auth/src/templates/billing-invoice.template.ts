export const BILLING_INVOICE_SUBJECT = 'Your TruckMoov invoice {{invoiceNumber}}';

export const BILLING_INVOICE_TEMPLATE = `
<!DOCTYPE html>
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
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    td { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 15px; color: #444; }
    td.value { text-align: right; font-weight: 600; }
    .footer { padding: 24px 32px; text-align: center; color: #aaa; font-size: 12px; border-top: 1px solid #eee; background: #fafafa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>TruckMoov</h1></div>
    <div class="body">
      <h2>Invoice {{invoiceNumber}}</h2>
      <p>Hello {{customerName}}, thank you for your payment. Your invoice is below.</p>
      <table>
        <tr><td>Issued</td><td class="value">{{issueDate}}</td></tr>
        <tr><td>Due</td><td class="value">{{dueDate}}</td></tr>
        <tr><td>Total</td><td class="value">{{totalNgn}}</td></tr>
        <tr><td>Paid</td><td class="value">{{amountPaidNgn}}</td></tr>
        <tr><td>Outstanding</td><td class="value">{{outstandingNgn}}</td></tr>
      </table>
      <p>Keep this email for your records.</p>
    </div>
    <div class="footer">© {{year}} TruckMoov. All rights reserved.</div>
  </div>
</body>
</html>
`;
