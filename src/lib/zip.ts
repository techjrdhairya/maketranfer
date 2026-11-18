// Minimal "store" (no compression) zip writer so a whole folder can be sent as one file.
// Files are never loaded into memory at once: CRC32 is computed in chunks and the File objects
// themselves are used as Blob parts. Limit: 4 GB total (no Zip64).
const MAX_ZIP_BYTES = 4 * 1024 * 1024 * 1024 - 1024 * 1024;

let crcTable: Uint32Array | null = null;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crcUpdate(crc: number, data: Uint8Array): number {
  const t = table();
  let c = crc;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return c;
}

async function fileCrc(file: File): Promise<number> {
  let crc = 0xffffffff;
  const STEP = 4 * 1024 * 1024;
  for (let off = 0; off < file.size; off += STEP) {
    crc = crcUpdate(crc, new Uint8Array(await file.slice(off, off + STEP).arrayBuffer()));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms || Date.now());
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  path: string; // e.g. "Photos/2026/img1.jpg"
  file: File;
}

export async function zipEntries(entries: ZipEntry[], zipName: string, onProgress?: (done: number, total: number) => void): Promise<File> {
  const total = entries.reduce((n, e) => n + e.file.size, 0);
  if (total > MAX_ZIP_BYTES) throw new Error('This folder is over 4 GB, which is too big to zip here. Send it in smaller parts.');
  if (entries.length === 0) throw new Error('That folder has no files to send.');

  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < entries.length; i++) {
    const { path, file } = entries[i];
    const name = enc.encode(path);
    const crc = await fileCrc(file);
    const { time, date } = dosDateTime(file.lastModified);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // store
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, file.size, true);
    local.setUint32(22, file.size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, file);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, file.size, true);
    cen.setUint32(24, file.size, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    const record = new Uint8Array(46 + name.length);
    record.set(new Uint8Array(cen.buffer), 0);
    record.set(name, 46);
    central.push(record);

    offset += 30 + name.length + file.size;
    onProgress?.(i + 1, entries.length);
  }

  const centralSize = central.reduce((n, r) => n + r.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  parts.push(...(central as BlobPart[]), end.buffer);

  return new File(parts, zipName, { type: 'application/zip', lastModified: Date.now() });
}
