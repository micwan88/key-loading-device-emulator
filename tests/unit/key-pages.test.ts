import { describe, it, expect, beforeEach } from "vitest";
import { renderKeyList } from "../../src/pages/key-list.ts";
import { renderKeyNew } from "../../src/pages/key-new.ts";
import { renderKeyImport } from "../../src/pages/key-import.ts";
import { renderKeyExport, setExportTarget } from "../../src/pages/key-export.ts";
import { listKeys, addKey, deleteKey, type SymKey } from "../../src/lib/key-store.ts";
import { listZmks, addZmk, deleteZmk } from "../../src/lib/zmk-store.ts";
import { bytesToHex } from "../../src/lib/ec.ts";
import { computeKcv, computeEmvKcv } from "../../src/lib/zmk.ts";
import { wrapTr31 } from "../../src/lib/tr31.ts";

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
