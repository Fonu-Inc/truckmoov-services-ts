import type { AiDataProtection } from './ai-governance.repository';

/**
 * Strips identifying detail from a prompt before it leaves the platform.
 *
 * Applied at the gateway rather than by each caller. A caller assembles a
 * prompt from real records because that is what makes the prompt useful, so
 * the last place the platform still controls what a third party sees is here.
 */

// +234 or 0 followed by ten or eleven digits, punctuation allowed between.
const NIGERIAN_PHONE = /(?:\+?234|0)[\s-]?\d(?:[\s-]?\d){8,10}/g;

// Two to four letters, a separator, three or four digits, a separator, two or
// three letters — the Nigerian plate shape the fleet uses.
const PLATE = /\b[A-Z]{2,4}[\s-]?\d{3,4}[\s-]?[A-Z]{2,3}\b/g;

export function redactPrompt(prompt: string, protection: AiDataProtection): string {
  let output = prompt;

  if (protection.redactPhoneNumbers) {
    output = output.replace(NIGERIAN_PHONE, "[phone]");
  }
  if (protection.redactVehiclePlates) {
    output = output.replace(PLATE, "[plate]");
  }

  return output;
}
