// Hacienda's yearly order of average prices (Orden HAC/1501/2025 for 2026), read from the text
// `pdftotext -table` makes of the BOE PDF: one model per line. Run once a year (scripts/hacienda.ts).

export interface VehicleRow {
  brand: string;
  model: string;
  period: string;
  fuel: string;
  cc: number | null;
  cylinders: number | null;
  kw: number;
  cvf: number | null;
  valueCents: number;
}

const ROW =
  /^(?<model>\S.*?)\s{2,}(?<from>(?:19|20)\d\d)(?:\s+(?<to>(?:19|20)\d\d))?(?:\s+(?<cc>\d+)\s+(?<cyl>\d+))?\s+(?<fuel>G|D|M|S|Elc|H|PHEV|GyE|DyE|SyE)\s+(?<kw>\d+(?:,\d+)?)(?:\s+(?<cvf>\d+,\d+))?\s+(?<cv>\d+)\s+(?<value>\d{1,3}(?:\.\d{3})*)(?:\s{2,}(?:Verificable en|cve:)\s+\S+)?\s*$/;
const decimal = (s: string) => Number(s.replace(',', '.'));

// Anexo I: under each "Marca: X", a row per model (electric ones have no displacement). The
// page margin ("Verificable en https://www.boe.es", "cve: …") may end a line: it is not data.
export function parseAnexoI(text: string): VehicleRow[] {
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((l) => /^\s*ANEXO II\s*$/.test(l));
  const rows: VehicleRow[] = [];
  let brand = '';
  for (const line of lines.slice(0, end === -1 ? undefined : end)) {
    const b = /^\s*Marca:\s*(.+?)(?:\s{2,}.*)?$/.exec(line);
    if (b) {
      brand = b[1]!;
      continue;
    }
    const m = ROW.exec(line)?.groups;
    if (!m || !brand) continue;
    rows.push({
      brand,
      model: m.model!.replace(/\s{2,}/g, ' '),
      period: `${m.from}-${m.to ?? ''}`,
      fuel: m.fuel!,
      cc: m.cc ? Number(m.cc) : null,
      cylinders: m.cyl ? Number(m.cyl) : null,
      kw: decimal(m.kw!),
      cvf: m.cvf ? decimal(m.cvf) : null,
      valueCents: Number(m.value!.replaceAll('.', '')) * 100,
    });
  }
  return rows;
}

// Anexo IV, its first table (cars, not campers): "Hasta 1 año. 100", "Más de 1 año, hasta 2. 84"…
// "Más de 12 años. 10" → years of use over which each percentage applies.
export function parseAnexoIV(text: string): { yearsOver: number; pctBp: number }[] {
  const start = text.search(/^\s*ANEXO IV\s*$/m);
  if (start === -1) throw new Error('Anexo IV not found');
  const rest = text.slice(start);
  const table = rest.slice(0, rest.search(/autocaravanas|campers/i));
  const out: { yearsOver: number; pctBp: number }[] = [];
  // The percentage is the first number after the label; the page margin may follow on the line.
  for (const m of table.matchAll(
    /(Hasta 1 año|Más de (\d+) años?)(?:, hasta \d+)?\.?\s+(\d{1,3})\b/g,
  ))
    out.push({ yearsOver: m[2] ? Number(m[2]) : 0, pctBp: Number(m[3]) * 100 });
  if (out.length < 2 || out[0]!.yearsOver !== 0) throw new Error('Anexo IV: unexpected table');
  return out;
}
