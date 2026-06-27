import { describe, it, expect } from "vitest";
import { buildKeyCsv, parseKeyCsv, KEY_CSV_HEADER } from "../../src/lib/key-tmd.ts";

describe("TMD key CSV", () => {
  const block = "D0144B0AE00E00000000DEADBEEF".padEnd(40, "0");

  it("builds a CSV with the exact header and UTC time fields", () => {
    const date = new Date(Date.UTC(2026, 5, 27, 9, 8)); // 2026-06-27 09:08 UTC
    const csv = buildKeyCsv({
      keyName: "MYKEY",
      keyType: "AES128",
      kcv: "ABCDEF",
      mzmkId: "7",
      mzmkKcv: "112233",
      tr31Block: block,
      date,
    });
    const [header, row] = csv.trim().split("\n");
    expect(header).toBe(KEY_CSV_HEADER);
    const cols = row.split(",");
    expect(cols.slice(0, 5)).toEqual(["2026", "6", "27", "9", "8"]);
    expect(cols[5]).toBe("MYKEY"); // KEY NAME
    expect(cols[6]).toBe("ABCDEF"); // CHECK VALUE
    expect(cols[7]).toBe("2"); // COMPONENTS
    expect(cols[8]).toBe("128-bit AES"); // ALGORITHM
    expect(cols[9]).toBe("7"); // MZMK ID
    expect(cols[10]).toBe("112233"); // MZMK CHECK VALUE
    expect(cols[11]).toBe(block); // TR31 KEY BLOCK
  });

  it("round-trips through parseKeyCsv (uppercasing KCVs and block)", () => {
    const csv = buildKeyCsv({
      keyName: "K",
      keyType: "DES2EDE",
      kcv: "aabbcc",
      mzmkId: "1",
      mzmkKcv: "ddeeff",
      tr31Block: block,
    });
    const parsed = parseKeyCsv(csv);
    expect(parsed.checkValue).toBe("AABBCC");
    expect(parsed.algorithmScheme).toBe("Double Length 3DES");
    expect(parsed.mzmkCheckValue).toBe("DDEEFF");
    expect(parsed.tr31Block).toBe(block);
  });

  it("throws on a missing column and on no data row", () => {
    expect(() => parseKeyCsv("YEAR,MONTH\n2026,6")).toThrow(/Missing column/);
    expect(() => parseKeyCsv(KEY_CSV_HEADER)).toThrow(/no data row/);
  });
});
