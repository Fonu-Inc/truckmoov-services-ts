const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function compareCodePoints(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = a.codePointAt(i)!;
    const right = b.codePointAt(j)!;
    if (left !== right) return left - right;
    i += left > 0xffff ? 2 : 1;
    j += right > 0xffff ? 2 : 1;
  }
  return a.length - i - (b.length - j);
}

function canonicalString(value: string): string {
  if (LONE_SURROGATE.test(value)) throw new Error("canonical_json_lone_surrogate");
  let out = '"';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (char === '"') out += '\\"';
    else if (char === "\\") out += "\\\\";
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += char;
  }
  return `${out}"`;
}

function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("canonical_json_non_finite_number");
  if (Number.isInteger(value)) {
    if (Math.abs(value) > MAX_SAFE) throw new Error("canonical_json_integer_out_of_range");
    return String(Object.is(value, -0) ? 0 : value);
  }
  const magnitude = Math.abs(value);
  if (magnitude < 1e-6 || magnitude >= 1e21) throw new Error("canonical_json_number_out_of_range");
  return String(value);
}

/** Identical output to CanonicalJSON in the Go eventbus package. Throws on unsupported values. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return canonicalString(value);
    case "number":
      return canonicalNumber(value);
    case "boolean":
      return value ? "true" : "false";
    case "object":
      return Array.isArray(value) ? canonicalArray(value) : canonicalObject(value as Record<string, unknown>);
    default:
      throw new Error(`canonical_json_unsupported_${typeof value}`);
  }
}

function canonicalArray(items: unknown[]): string {
  return `[${items.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
}

function canonicalObject(object: Record<string, unknown>): string {
  const keys = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort(compareCodePoints);
  return `{${keys.map((key) => `${canonicalString(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}
