import { writeFileSync } from 'node:fs';

const count = Number(process.argv[2] ?? 10000);
const out = process.argv[3] ?? '/Users/mac/fonu-work/truckmoov/platform-stock-10000.csv';

export function luhnCheckDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

// 35999 prefix keeps these clear of the 3597xxxxxxxxxxx devices already on dev
export function imeiFor(seq) {
  const body = `35999${String(seq).padStart(9, '0')}`;
  return `${body}${luhnCheckDigit(body)}`;
}

const lines = ['imei,manufacturer,model,name'];
for (let i = 1; i <= count; i++) {
  const teltonika = i % 5 < 3;
  lines.push(
    [
      imeiFor(i),
      teltonika ? 'Teltonika' : 'Queclink',
      teltonika ? 'FMB920' : 'GV300',
      `STOCK-${String(i).padStart(6, '0')}`,
    ].join(','),
  );
}
writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`wrote ${count} devices to ${out}`);
