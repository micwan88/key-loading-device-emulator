// Thales payShield TMD key-exchange CSV — wraps/recovers a single working key as a
// TR-31 key block protected by a ZMK. One header + one data row, like the MZMKdata CSV.

import { type ZmkType, ZMK_SCHEME } from "./zmk.ts";

export const KEY_CSV_HEADER =
  "YEAR,MONTH,DAY,HOUR,MINUTE,KEY NAME,CHECK VALUE,COMPONENTS,ALGORITHM,MZMK ID,MZMK CHECK VALUE,TR31 KEY BLOCK";

export interface BuildKeyCsvInput {
  keyName: string;
  keyType: ZmkType; // wrapped key type → ALGORITHM scheme label
  kcv: string; // CHECK VALUE — the key's standard KCV (not EMV)
  mzmkId: string; // selected ZMK ID
  mzmkKcv: string; // MZMK CHECK VALUE — the ZMK's standard KCV (not EMV)
  tr31Block: string; // TR-31 key block
  date?: Date; // generation time; UTC parts are written
}

export function buildKeyCsv(input: BuildKeyCsvInput): string {
  const d = input.date ?? new Date();
  const row = [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    input.keyName,
    input.kcv,
    2,
    ZMK_SCHEME[input.keyType],
    input.mzmkId,
    input.mzmkKcv,
    input.tr31Block,
  ].join(",");
  return `${KEY_CSV_HEADER}\n${row}\n`;
}

export interface ParsedKeyCsv {
  checkValue: string; // KCV of the wrapped key, uppercase
  algorithmScheme: string; // ALGORITHM scheme label (e.g. "128-bit AES")
  mzmkCheckValue: string; // KCV of the protecting ZMK, uppercase
  tr31Block: string; // TR-31 key block, uppercase + trimmed
}

export function parseKeyCsv(text: string): ParsedKeyCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV has no data row");
  const header = lines[0].split(",").map((s) => s.trim());
  const cols = lines[1].split(",").map((s) => s.trim());
  const get = (name: string): string => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Missing column: ${name}`);
    return cols[i];
  };
  return {
    checkValue: get("CHECK VALUE").toUpperCase(),
    algorithmScheme: get("ALGORITHM"),
    mzmkCheckValue: get("MZMK CHECK VALUE").toUpperCase(),
    tr31Block: get("TR31 KEY BLOCK").trim().toUpperCase(),
  };
}
