// Just enough of Excel to read official spreadsheets in the import scripts (Node only): the
// Ministry of Housing still publishes .xls (BIFF8 in an OLE2 file) and INE its list of
// municipalities as .xlsx. Values come back as text or numbers; formats, dates and formulas'
// own text are ignored.
import { inflateRawSync } from 'node:zlib';

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

// --- .xls -------------------------------------------------------------------------------------

// The "Workbook" stream of an OLE2 compound file.
function workbookStream(file: Uint8Array): Uint8Array {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (v.getUint32(0, true) !== 0xe011cfd0) throw new Error('not an OLE2 file');
  const size = 1 << v.getUint16(0x1e, true);
  const at = (sector: number) => (sector + 1) * size;
  // FAT sectors: 109 in the header, the rest in the DIFAT chain.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) fatSectors.push(v.getUint32(0x4c + i * 4, true));
  for (let s = v.getUint32(0x44, true), n = v.getUint32(0x48, true); n > 0; n--) {
    for (let i = 0; i < size / 4 - 1; i++) fatSectors.push(v.getUint32(at(s) + i * 4, true));
    s = v.getUint32(at(s) + size - 4, true);
  }
  const fat: number[] = [];
  for (const s of fatSectors.slice(0, v.getUint32(0x2c, true)))
    for (let i = 0; i < size / 4; i++) fat.push(v.getUint32(at(s) + i * 4, true));
  const chain = (first: number, bytes?: number) => {
    const parts: Uint8Array[] = [];
    for (let s = first; s < 0xfffffffa; s = fat[s]!) parts.push(file.subarray(at(s), at(s) + size));
    const all = Buffer.concat(parts);
    return bytes === undefined ? all : all.subarray(0, bytes);
  };
  const dir = chain(v.getUint32(0x30, true));
  const d = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = d.getUint16(o + 0x40, true);
    const name = Buffer.from(dir.subarray(o, o + Math.max(0, len - 2))).toString('utf16le');
    if (d.getUint8(o + 0x42) !== 2 || (name !== 'Workbook' && name !== 'Book')) continue;
    const bytes = d.getUint32(o + 0x78, true);
    if (bytes < v.getUint32(0x38, true)) throw new Error('workbook in the mini stream');
    return chain(d.getUint32(o + 0x74, true), bytes);
  }
  throw new Error('no Workbook stream');
}

// A record's data, read across the CONTINUE records that follow it (strings may be cut there,
// and each piece of characters starts with its own "compressed or not" flag).
class Reader {
  private seg = 0;
  private pos = 0;
  private readonly segs: Uint8Array[];
  constructor(segs: Uint8Array[]) {
    this.segs = segs;
  }
  private ensure() {
    while (this.pos >= this.segs[this.seg]!.length && this.seg < this.segs.length - 1) {
      this.seg++;
      this.pos = 0;
    }
  }
  bytes(n: number) {
    this.ensure();
    const s = this.segs[this.seg]!;
    const out = s.subarray(this.pos, this.pos + n);
    this.pos += n;
    return new DataView(out.buffer, out.byteOffset, out.byteLength);
  }
  u8 = () => this.bytes(1).getUint8(0);
  u16 = () => this.bytes(2).getUint16(0, true);
  u32 = () => this.bytes(4).getUint32(0, true);
  skip(n: number) {
    while (n > 0) {
      this.ensure();
      const take = Math.min(n, this.segs[this.seg]!.length - this.pos);
      this.pos += take;
      n -= take;
    }
  }
  string(cch: number) {
    let flags = this.u8();
    const runs = flags & 8 ? this.u16() : 0;
    const ext = flags & 4 ? this.u32() : 0;
    let out = '';
    while (out.length < cch) {
      if (this.pos >= this.segs[this.seg]!.length) {
        this.seg++;
        this.pos = 0;
        flags = this.u8();
      }
      const wide = flags & 1;
      const left = (this.segs[this.seg]!.length - this.pos) >> wide;
      const n = Math.min(cch - out.length, left);
      const b = this.bytes(n << wide);
      for (let i = 0; i < n; i++)
        out += String.fromCharCode(wide ? b.getUint16(i * 2, true) : b.getUint8(i));
    }
    this.skip(runs * 4 + ext);
    return out;
  }
}

const rk = (x: number) => {
  let n: number;
  if (x & 2) n = x >> 2;
  else {
    const b = new DataView(new ArrayBuffer(8));
    b.setUint32(4, x & 0xfffffffc, true);
    n = b.getFloat64(0, true);
  }
  return x & 1 ? n / 100 : n;
};

// Every sheet of an .xls, in order.
export function readXls(file: Uint8Array): Sheet[] {
  const wb = workbookStream(file);
  const v = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const records: { type: number; at: number; data: Uint8Array }[] = [];
  for (let o = 0; o + 4 <= wb.length;) {
    const len = v.getUint16(o + 2, true);
    records.push({ type: v.getUint16(o, true), at: o, data: wb.subarray(o + 4, o + 4 + len) });
    o += 4 + len;
  }
  const continued = (i: number) => {
    const segs = [records[i]!.data];
    while (records[i + segs.length]?.type === 0x3c) segs.push(records[i + segs.length]!.data);
    return new Reader(segs);
  };
  const sheets: { name: string; at: number }[] = [];
  let sst: string[] = [];
  records.forEach((r, i) => {
    if (r.type === 0x85) {
      const x = continued(i);
      const at = x.u32();
      x.skip(2);
      sheets.push({ at, name: x.string(x.u8()) });
    } else if (r.type === 0xfc && sst.length === 0) {
      const x = continued(i);
      x.skip(4);
      sst = Array.from({ length: x.u32() }, () => x.string(x.u16()));
    }
  });
  return sheets.map(({ name, at }) => {
    const rows: Cell[][] = [];
    const set = (row: number, col: number, value: Cell) => ((rows[row] ??= [])[col] = value);
    let i = records.findIndex((r) => r.at === at) + 1;
    let pending: [number, number] | null = null;
    for (; i < records.length && records[i]!.type !== 0x0a; i++) {
      const { type, data } = records[i]!;
      const d = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const row = d.byteLength >= 4 ? d.getUint16(0, true) : 0;
      const col = d.byteLength >= 4 ? d.getUint16(2, true) : 0;
      if (type === 0xfd) set(row, col, sst[d.getUint32(6, true)] ?? null);
      else if (type === 0x203) set(row, col, d.getFloat64(6, true));
      else if (type === 0x27e) set(row, col, rk(d.getUint32(6, true)));
      else if (type === 0xbd)
        for (let c = col, o = 4; o + 6 <= data.length - 2; c++, o += 6)
          set(row, c, rk(d.getUint32(o + 2, true)));
      else if (type === 0x204) {
        const x = continued(i);
        x.skip(6);
        set(row, col, x.string(x.u16()));
      } else if (type === 0x06) {
        if (d.getUint16(12, true) !== 0xffff) set(row, col, d.getFloat64(6, true));
        else if (d.getUint8(6) === 0) pending = [row, col];
      } else if (type === 0x207 && pending) {
        const x = continued(i);
        set(pending[0], pending[1], x.string(x.u16()));
        pending = null;
      }
    }
    return { name, rows: Array.from(rows, (r) => Array.from(r ?? [], (c) => c ?? null)) };
  });
}

// --- .xlsx ------------------------------------------------------------------------------------

function unzip(file: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let end = file.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip file');
  const out = new Map<string, Uint8Array>();
  let o = v.getUint32(end + 16, true);
  for (let n = v.getUint16(end + 10, true); n > 0; n--) {
    const method = v.getUint16(o + 10, true);
    const size = v.getUint32(o + 20, true);
    const nameLen = v.getUint16(o + 28, true);
    const name = Buffer.from(file.subarray(o + 46, o + 46 + nameLen)).toString('utf8');
    const local = v.getUint32(o + 42, true);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = file.subarray(start, start + size);
    out.set(name, method === 8 ? inflateRawSync(raw) : raw);
    o += 46 + nameLen + v.getUint16(o + 30, true) + v.getUint16(o + 32, true);
  }
  return out;
}

const unescape = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' ? 2 : 1), e[1] === 'x' ? 16 : 10))
      : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e]!,
  );
const texts = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => unescape(m[1]!)).join('');

// The first sheet of an .xlsx. shortcut: takes worksheets/sheet1.xml, the first sheet in every
// file INE publishes; read workbook.xml and its relations if a file ever orders them otherwise.
export function readXlsx(file: Uint8Array): Cell[][] {
  const files = unzip(file);
  const text = (name: string) => Buffer.from(files.get(name) ?? []).toString('utf8');
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    texts(m[1]!),
  );
  const rows: Cell[][] = [];
  for (const r of text('xl/worksheets/sheet1.xml').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Cell[] = [];
    for (const c of r[1]!.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)/.exec(c[1]!)?.[1] ?? '';
      const col = [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const type = /t="(\w+)"/.exec(c[1]!)?.[1];
      const value = /<v>([^<]*)<\/v>/.exec(c[2] ?? '')?.[1];
      row[col] =
        type === 's'
          ? (shared[Number(value)] ?? null)
          : type === 'inlineStr'
            ? texts(c[2] ?? '')
            : type === 'str'
              ? unescape(value ?? '')
              : value === undefined
                ? null
                : Number(value);
    }
    rows.push(Array.from(row, (x) => x ?? null));
  }
  return rows;
}
