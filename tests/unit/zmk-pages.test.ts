import { describe, it, expect, beforeEach } from "vitest";
import { renderZmkList } from "../../src/pages/zmk-list.ts";
import { renderZmkDerive } from "../../src/pages/zmk-derive.ts";
import { setKeyPair } from "../../src/lib/store.ts";
import { addZmk, listZmks, deleteZmk } from "../../src/lib/zmk-store.ts";
import type { ECKeyPair } from "../../src/lib/ec.ts";

// A minimal fake keypair — enough for the store/guard checks that don't touch crypto.
const fakeKeyPair = { curve: "P-256", privateKey: {}, publicKey: {} } as unknown as ECKeyPair;

function mount(render: (root: HTMLElement) => void): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(root);
  return root;
}

function clearZmks(): void {
  for (const z of [...listZmks()]) deleteZmk(z.id);
}

describe("ZMK list page", () => {
  beforeEach(() => {
    setKeyPair(null);
    clearZmks();
  });

  it("disables New (with tooltip) when there is no keypair", () => {
    const root = mount(renderZmkList);
    const btn = root.querySelector('[data-testid="new-zmk"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect((root.querySelector('[data-testid="new-wrap"]') as HTMLElement).title).toMatch(
      /keypair first/i,
    );
  });

  it("enables New when a keypair exists", () => {
    setKeyPair(fakeKeyPair);
    const root = mount(renderZmkList);
    expect((root.querySelector('[data-testid="new-zmk"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows details and enables delete only after selecting a ZMK", () => {
    addZmk({ zmkId: "42", type: "AES128", keyHex: "00112233", kcv: "ABCDEF", emvKcv: "123456" });
    const root = mount(renderZmkList);

    // No delete button before selection.
    expect(root.querySelector('[data-testid="delete-zmk"]')).toBeNull();

    (root.querySelector('[data-testid="zmk-item"]') as HTMLButtonElement).click();
    expect((root.querySelector('[data-testid="detail-id"]') as HTMLElement).textContent).toBe("42");
    expect((root.querySelector('[data-testid="detail-kcv"]') as HTMLElement).textContent).toBe(
      "ABCDEF",
    );
    // EMV KCV row shown for AES.
    expect((root.querySelector('[data-testid="detail-emv-kcv"]') as HTMLElement).textContent).toBe(
      "123456",
    );

    const del = root.querySelector('[data-testid="delete-zmk"]') as HTMLButtonElement;
    expect(del).toBeTruthy();
    del.click();
    expect(listZmks()).toHaveLength(0);
  });

  it("hides the EMV KCV row for non-AES ZMKs", () => {
    addZmk({ zmkId: "7", type: "DES2EDE", keyHex: "00112233", kcv: "ABCDEF" });
    const root = mount(renderZmkList);
    (root.querySelector('[data-testid="zmk-item"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-testid="detail-emv-kcv"]')).toBeNull();
  });
});

describe("ZMK derive page", () => {
  beforeEach(() => {
    setKeyPair(null);
    clearZmks();
  });

  it("disables derive and warns when no keypair", () => {
    const root = mount(renderZmkDerive);
    expect((root.querySelector('[data-testid="derive"]') as HTMLButtonElement).disabled).toBe(true);
    expect((root.querySelector('[data-testid="derive-desc"]') as HTMLElement).textContent).toMatch(
      /no keypair/i,
    );
  });

  it("rejects an empty or zero ZMK ID before deriving", () => {
    setKeyPair(fakeKeyPair);
    const root = mount(renderZmkDerive);
    const derive = root.querySelector('[data-testid="derive"]') as HTMLButtonElement;
    const idEl = root.querySelector('[data-testid="zmk-id"]') as HTMLInputElement;
    expect(derive.disabled).toBe(false);

    derive.click(); // empty → validation, no crypto reached
    expect((root.querySelector('[data-testid="status"]') as HTMLElement).textContent).toMatch(
      /1-5 digits/i,
    );

    idEl.value = "00000"; // all-zero → invalid
    derive.click();
    expect((root.querySelector('[data-testid="status"]') as HTMLElement).textContent).toMatch(
      /1-5 digits/i,
    );
  });

  it("rejects a duplicate ZMK ID", () => {
    setKeyPair(fakeKeyPair);
    addZmk({ zmkId: "5", type: "AES128", keyHex: "00", kcv: "ABCDEF" });
    const root = mount(renderZmkDerive);
    (root.querySelector('[data-testid="zmk-id"]') as HTMLInputElement).value = "5";
    (root.querySelector('[data-testid="derive"]') as HTMLButtonElement).click();
    expect((root.querySelector('[data-testid="status"]') as HTMLElement).textContent).toMatch(
      /already exists/i,
    );
  });

  it("generates a ZMK ID by incrementing from the current max", () => {
    setKeyPair(fakeKeyPair);
    addZmk({ zmkId: "12", type: "AES128", keyHex: "00", kcv: "ABCDEF" });
    const root = mount(renderZmkDerive);
    (root.querySelector('[data-testid="gen-zmk-id"]') as HTMLButtonElement).click();
    expect((root.querySelector('[data-testid="zmk-id"]') as HTMLInputElement).value).toBe("13");
  });

  it("shows the current curve and 5 ZMK types", () => {
    setKeyPair(fakeKeyPair);
    const root = mount(renderZmkDerive);
    expect((root.querySelector('[data-testid="derive-desc"]') as HTMLElement).textContent).toContain(
      "P-256",
    );
    expect(root.querySelectorAll('[data-testid="zmk-type"] option')).toHaveLength(5);
  });

  it("generates a 128-byte random shared secret in uppercase hex", () => {
    setKeyPair(fakeKeyPair);
    const root = mount(renderZmkDerive);
    (root.querySelector('[data-testid="gen-shared"]') as HTMLButtonElement).click();
    const val = (root.querySelector('[data-testid="shared-secret"]') as HTMLTextAreaElement).value;
    expect(val).toMatch(/^[0-9A-F]{256}$/); // 128 bytes, uppercase
  });
});
