import { describe, it, expect, beforeEach } from "vitest";
import { renderKeyList } from "../../src/pages/key-list.ts";
import { renderKeyNew } from "../../src/pages/key-new.ts";
import { renderKeyImport } from "../../src/pages/key-import.ts";
import { renderKeyExport, setExportTarget } from "../../src/pages/key-export.ts";
import { listKeys, addKey, deleteKey, type SymKey } from "../../src/lib/key-store.ts";
import { listZmks, addZmk, deleteZmk } from "../../src/lib/zmk-store.ts";
import { bytesToHex, hexToBytes } from "../../src/lib/ec.ts";
import { computeKcv, computeEmvKcv } from "../../src/lib/zmk.ts";
import { wrapTr31 } from "../../src/lib/tr31.ts";
import { buildKeyCsv } from "../../src/lib/key-tmd.ts";

function mount(render: (root: HTMLElement) => void): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(root);
  return root;
}
const $ = <T extends HTMLElement>(root: HTMLElement, id: string) =>
  root.querySelector(`[data-testid="${id}"]`) as T;

function clearAll(): void {
  for (const k of [...listKeys()]) deleteKey(k.id);
  for (const z of [...listZmks()]) deleteZmk(z.id);
}

describe("New key page", () => {
  beforeEach(clearAll);

  it("max length tracks the chosen type", () => {
    const root = mount(renderKeyNew);
    const value = $<HTMLTextAreaElement>(root, "key-value");
    const type = $<HTMLSelectElement>(root, "key-type");

    type.value = "AES256";
    type.dispatchEvent(new Event("change"));
    expect(value.maxLength).toBe(64); // 32 bytes

    type.value = "DES2EDE";
    type.dispatchEvent(new Event("change"));
    expect(value.maxLength).toBe(32); // 16 bytes
  });

  it("generates a random key matching the type length", () => {
    const root = mount(renderKeyNew);
    $<HTMLSelectElement>(root, "key-type").value = "AES192";
    $<HTMLSelectElement>(root, "key-type").dispatchEvent(new Event("change"));
    $<HTMLButtonElement>(root, "gen-key").click();
    expect($<HTMLTextAreaElement>(root, "key-value").value).toMatch(/^[0-9A-F]{48}$/); // 24 bytes
  });

  it("rejects a wrong-length key value", () => {
    const root = mount(renderKeyNew);
    $<HTMLInputElement>(root, "key-id").value = "1";
    $<HTMLTextAreaElement>(root, "key-value").value = "00112233"; // too short for AES128
    $<HTMLButtonElement>(root, "save-key").click();
    expect($(root, "status").textContent).toMatch(/needs exactly 16 bytes/i);
    expect(listKeys()).toHaveLength(0);
  });

  it("rejects a zero / duplicate Key ID", () => {
    addKey({ keyId: "5", type: "AES128", keyHex: "00", kcv: "ABCDEF" });
    const root = mount(renderKeyNew);
    $<HTMLInputElement>(root, "key-id").value = "00000";
    $<HTMLButtonElement>(root, "save-key").click();
    expect($(root, "status").textContent).toMatch(/1-5 digits/i);

    $<HTMLInputElement>(root, "key-id").value = "5";
    $<HTMLTextAreaElement>(root, "key-value").value = "00".repeat(16);
    $<HTMLButtonElement>(root, "save-key").click();
    expect($(root, "status").textContent).toMatch(/already exists/i);
  });

  it("saves a valid key with a computed KCV and EMV KCV (AES)", () => {
    const root = mount(renderKeyNew);
    $<HTMLInputElement>(root, "key-id").value = "9";
    $<HTMLSelectElement>(root, "key-type").value = "AES128";
    $<HTMLTextAreaElement>(root, "key-value").value = "00".repeat(16);
    $<HTMLButtonElement>(root, "save-key").click();

    const saved = listKeys().find((k) => k.keyId === "9") as SymKey;
    expect(saved.kcv).toBe(computeKcv("AES128", new Uint8Array(16)));
    expect(saved.emvKcv).toBe(computeEmvKcv(new Uint8Array(16)));
  });

  it("populates KCV (and EMV KCV for AES) after generate, and clears them on type change", () => {
    const root = mount(renderKeyNew);
    const kcv = $<HTMLInputElement>(root, "kcv");
    const emvRow = $<HTMLLabelElement>(root, "emv-kcv-row");
    const emv = $<HTMLInputElement>(root, "emv-kcv");

    $<HTMLSelectElement>(root, "key-type").value = "AES128";
    $<HTMLSelectElement>(root, "key-type").dispatchEvent(new Event("change"));
    $<HTMLButtonElement>(root, "gen-key").click();
    const bytes = hexToBytes($<HTMLTextAreaElement>(root, "key-value").value);
    expect(kcv.value).toBe(computeKcv("AES128", bytes));
    expect(emv.value).toBe(computeEmvKcv(bytes));
    expect(emvRow.className).not.toContain("hidden");

    // 3DES has no EMV KCV; changing type clears the value + KCV fields.
    $<HTMLSelectElement>(root, "key-type").value = "DES2EDE";
    $<HTMLSelectElement>(root, "key-type").dispatchEvent(new Event("change"));
    expect($<HTMLTextAreaElement>(root, "key-value").value).toBe("");
    expect(kcv.value).toBe("");
    expect(emvRow.className).toContain("hidden");

    $<HTMLButtonElement>(root, "gen-key").click();
    expect(kcv.value).toMatch(/^[0-9A-F]{6}$/);
    expect(emvRow.className).toContain("hidden"); // still no EMV row for 3DES
  });
});

describe("List page", () => {
  beforeEach(clearAll);

  it("shows ID, type and (KCV); detail + delete after selecting", () => {
    addKey({ keyId: "3", type: "AES128", keyHex: "00112233", kcv: "ABCDEF", emvKcv: "123456" });
    const root = mount(renderKeyList);
    expect($(root, "key-item").textContent).toContain("(ABCDEF)");
    expect($<HTMLButtonElement>(root, "export-key").disabled).toBe(true);

    $<HTMLButtonElement>(root, "key-item").click();
    expect($(root, "detail-id").textContent).toBe("3");
    expect($(root, "detail-emv-kcv").textContent).toBe("123456");
    expect($<HTMLButtonElement>(root, "export-key").disabled).toBe(false);

    $<HTMLButtonElement>(root, "delete-key").click();
    expect(listKeys()).toHaveLength(0);
  });
});

describe("Import / Export round trip via the pages", () => {
  beforeEach(clearAll);

  it("exports a key to a TR-31 block, then imports it back", () => {
    // A ZMK to protect the block (AES128 → version D).
    const zmkKey = new Uint8Array(16).map((_, i) => i + 1);
    addZmk({ zmkId: "1", type: "AES128", keyHex: bytesToHex(zmkKey).toUpperCase(), kcv: "AAAAAA" });
    // A key to export.
    const keyBytes = new Uint8Array(16).map((_, i) => 0xa0 + i);
    const key = addKey({
      keyId: "10",
      type: "AES128",
      keyHex: bytesToHex(keyBytes).toUpperCase(),
      kcv: computeKcv("AES128", keyBytes),
    });

    // Export page.
    setExportTarget(key.id);
    const exp = mount(renderKeyExport);
    $<HTMLSelectElement>(exp, "key-usage").value = "D0";
    $<HTMLButtonElement>(exp, "do-export").click();
    const block = $<HTMLTextAreaElement>(exp, "keyblock-out").value;
    expect(block[0]).toBe("D"); // version D
    expect($(exp, "status").textContent).toMatch(/exported under zmk/i);

    // Import page — same ZMK is the only option (selected by default).
    const imp = mount(renderKeyImport);
    $<HTMLInputElement>(imp, "key-id").value = "20";
    $<HTMLTextAreaElement>(imp, "keyblock").value = block;
    $<HTMLButtonElement>(imp, "do-import").click();

    const imported = listKeys().find((k) => k.keyId === "20") as SymKey;
    expect(imported).toBeTruthy();
    expect(imported.type).toBe("AES128");
    expect(imported.keyHex).toBe(bytesToHex(keyBytes).toUpperCase());
  });

  it("import rejects a non-symmetric (asymmetric) key algorithm", () => {
    const zmkKey = new Uint8Array(16).map((_, i) => i + 1);
    addZmk({ zmkId: "1", type: "AES128", keyHex: bytesToHex(zmkKey).toUpperCase(), kcv: "AAAAAA" });
    const block = wrapTr31({
      kbpkType: "AES128",
      kbpk: zmkKey,
      keyType: "AES128",
      key: new Uint8Array(16),
      keyUsage: "D0",
      modeOfUse: "B",
      exportability: "E",
    });
    // Corrupt the algorithm field (index 7) to 'R' (RSA, asymmetric).
    const asym = block.slice(0, 7) + "R" + block.slice(8);

    const imp = mount(renderKeyImport);
    $<HTMLInputElement>(imp, "key-id").value = "30";
    $<HTMLTextAreaElement>(imp, "keyblock").value = asym;
    $<HTMLButtonElement>(imp, "do-import").click();
    expect($(imp, "status").textContent).toMatch(/symmetric/i);
    expect(listKeys()).toHaveLength(0);
  });
});

describe("Export page copy + layout", () => {
  beforeEach(clearAll);

  it("shows the key HEX, the new ZMK option format, and requires a key name for CSV export", () => {
    addZmk({ zmkId: "2", type: "AES128", keyHex: "AB".repeat(16), kcv: "AAAAAA", emvKcv: "BBBBBB" });
    const keyBytes = new Uint8Array(16).fill(0x10);
    const key = addKey({
      keyId: "10",
      type: "AES128",
      keyHex: bytesToHex(keyBytes).toUpperCase(),
      kcv: computeKcv("AES128", keyBytes),
    });
    setExportTarget(key.id);
    const exp = mount(renderKeyExport);

    expect($(exp, "prop-key").textContent).toBe(bytesToHex(keyBytes).toUpperCase());
    expect($(exp, "zmk-select").textContent).toContain("2: AES128 (AAAAAA) - (EMV: BBBBBB)");

    // Export CSV requires a key name.
    $<HTMLButtonElement>(exp, "export-csv").click();
    expect($(exp, "status").textContent).toMatch(/key name/i);
  });
});

// Feed a CSV string to the import page's "Import key csv" file input and flush the
// async change handler.
async function importCsv(root: HTMLElement, csv: string): Promise<void> {
  const input = $<HTMLInputElement>(root, "import-csv-file");
  // jsdom's File has no .text(); the handler only needs files[0].text().
  const file = { name: "key.csv", text: async () => csv };
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change"));
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("Import key CSV (TMD) via the page", () => {
  beforeEach(clearAll);

  // A ZMK + key + a CSV wrapping that key under the ZMK. Tweak fields to force failures.
  function setup(overrides: Partial<{ kcv: string; mzmkKcv: string; scheme: "AES128" | "DES2EDE" }> = {}) {
    const zmkBytes = new Uint8Array(16).map((_, i) => i + 1);
    const zmkKcv = computeKcv("AES128", zmkBytes);
    addZmk({ zmkId: "1", type: "AES128", keyHex: bytesToHex(zmkBytes).toUpperCase(), kcv: zmkKcv });

    const keyBytes = new Uint8Array(16).map((_, i) => 0xa0 + i);
    const block = wrapTr31({
      kbpkType: "AES128",
      kbpk: zmkBytes,
      keyType: "AES128",
      key: keyBytes,
      keyUsage: "D0",
      modeOfUse: "B",
      exportability: "E",
    });
    const csv = buildKeyCsv({
      keyName: "K",
      keyType: overrides.scheme ?? "AES128",
      kcv: overrides.kcv ?? computeKcv("AES128", keyBytes),
      mzmkId: "1",
      mzmkKcv: overrides.mzmkKcv ?? zmkKcv,
      tr31Block: block,
    });
    return { keyBytes, csv };
  }

  it("imports a valid CSV and saves the key", async () => {
    const { keyBytes, csv } = setup();
    const imp = mount(renderKeyImport);
    $<HTMLInputElement>(imp, "key-id").value = "20";
    await importCsv(imp, csv);

    const imported = listKeys().find((k) => k.keyId === "20") as SymKey;
    expect(imported).toBeTruthy();
    expect(imported.keyHex).toBe(bytesToHex(keyBytes).toUpperCase());
  });

  it("rejects when ALGORITHM does not match the key block algorithm", async () => {
    const { csv } = setup({ scheme: "DES2EDE" }); // CSV says 3DES; block is AES
    const imp = mount(renderKeyImport);
    $<HTMLInputElement>(imp, "key-id").value = "21";
    await importCsv(imp, csv);
    expect($(imp, "status").textContent).toMatch(/ALGORITHM/i);
    expect(listKeys()).toHaveLength(0);
  });

  it("rejects when MZMK CHECK VALUE does not match the selected ZMK", async () => {
    const { csv } = setup({ mzmkKcv: "DEADBE" });
    const imp = mount(renderKeyImport);
    $<HTMLInputElement>(imp, "key-id").value = "22";
    await importCsv(imp, csv);
    expect($(imp, "status").textContent).toMatch(/MZMK CHECK VALUE/i);
    expect(listKeys()).toHaveLength(0);
  });

  it("rejects when CHECK VALUE does not match the recovered key", async () => {
    const { csv } = setup({ kcv: "C0FFEE" });
    const imp = mount(renderKeyImport);
    $<HTMLInputElement>(imp, "key-id").value = "23";
    await importCsv(imp, csv);
    expect($(imp, "status").textContent).toMatch(/CHECK VALUE/i);
    expect(listKeys()).toHaveLength(0);
  });
});
