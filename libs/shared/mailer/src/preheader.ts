// Filler keeps inboxes from appending the visible body after a short preheader.
const FILLER = '&#847;&zwnj;&nbsp;'.repeat(40);

/** Hidden first-body element that inboxes show as the preview line instead of the brand header. */
export function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${text}${FILLER}</div>`;
}
