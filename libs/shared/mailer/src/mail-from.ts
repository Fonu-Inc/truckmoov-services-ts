/** Gives a bare MAIL_FROM address a display name, so inboxes show "FleetPro" and not "hello". */
export function formatMailFrom(from: string, name: string): string {
  const address = from.trim();
  const display = name.trim().replace(/["\\\r\n]/g, "");
  if (address.includes("<") || !display) return address;
  return `"${display}" <${address}>`;
}
