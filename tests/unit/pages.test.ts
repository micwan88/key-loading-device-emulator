import { describe, it, expect, beforeEach } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { renderLanding } from "../../src/pages/landing.ts";
import { renderEcKeypair } from "../../src/pages/ec-keypair.ts";
import { getKeyPair, setKeyPair } from "../../src/lib/store.ts";
import { listKeys, clearKeys } from "../../src/lib/key-store.ts";
import { clearZmks } from "../../src/lib/zmk-store.ts";

function mount(render: (root: HTMLElement) => void): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(root);
  return root;
}

// Feed a backup zip to the landing restore-file input and flush the async handler.
async function restore(root: HTMLElement, zip: Uint8Array): Promise<void> {
  const input = root.querySelector('[data-testid="restore-file"]') as HTMLInputElement;
  const file = { name: "x.bak", arrayBuffer: async () => zip.buffer };
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change"));
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("landing page", () => {
  it("shows the EC Keypair menu item linking to the route", () => {
    const root = mount(renderLanding);
    const item = root.querySelector('[data-testid="menu-item"]') as HTMLAnchorElement;
    expect(item).toBeTruthy();
    expect(item.textContent).toContain("EC Keypair");
    expect(item.getAttribute("href")).toBe("#/ec-keypair");
  });

  it("shows a RED production warning", () => {
    const root = mount(renderLanding);
    const warn = root.querySelector('[data-testid="prod-warning"]') as HTMLElement;
    expect(warn.textContent).toMatch(/don't use it for production/i);
    expect(warn.className).toContain("text-danger");
  });

  it("includes a Key Management menu item linking to /keys", () => {
    const root = mount(renderLanding);
    const items = [...root.querySelectorAll('[data-testid="menu-item"]')] as HTMLAnchorElement[];
    const keys = items.find((a) => a.getAttribute("href") === "#/keys");
    expect(keys?.textContent).toContain("Key Management");
  });

  it("offers Backup and Restore Backup controls", () => {
    const root = mount(renderLanding);
    expect(root.querySelector('[data-testid="backup"]')).toBeTruthy();
    const restore = root.querySelector('[data-testid="restore-file"]') as HTMLInputElement;
    expect(restore).toBeTruthy();
    expect(restore.accept).toContain(".bak");
  });
});

describe("landing restore — KCV-mismatch Accept/Skip prompt", () => {
  beforeEach(() => {
    clearKeys();
    clearZmks();
    setKeyPair(null);
  });

  // A backup zip with one key whose stored KCV is deliberately wrong.
  const mismatchZip = (): Uint8Array =>
    zipSync({ "keys.csv": strToU8("ID,Type,KeyValue,KCV\n7,AES128,00112233445566778899AABBCCDDEEFF,BADBAD\n") });

  it("shows the prompt and commits the key (recomputed KCV) on Accept", async () => {
    const root = mount(renderLanding);
    await restore(root, mismatchZip());

    const prompt = root.querySelector('[data-testid="restore-prompt"]') as HTMLElement;
    expect(prompt.classList.contains("hidden")).toBe(false);
    expect(root.querySelector('[data-testid="restore-prompt-list"]')?.textContent).toContain("Key 7");

    (root.querySelector('[data-testid="restore-accept"]') as HTMLButtonElement).click();
    expect(prompt.classList.contains("hidden")).toBe(true);
    expect(listKeys().map((k) => k.keyId)).toEqual(["7"]);
    expect(listKeys()[0].kcv).not.toBe("BADBAD"); // recomputed
  });

  it("omits the key on Skip", async () => {
    const root = mount(renderLanding);
    await restore(root, mismatchZip());
    (root.querySelector('[data-testid="restore-skip"]') as HTMLButtonElement).click();
    expect(listKeys()).toHaveLength(0);
  });
});

describe("EC Keypair page", () => {
  beforeEach(() => setKeyPair(null));

  it("renders all the required controls", () => {
    const root = mount(renderEcKeypair);
    for (const id of [
      "curve",
      "generate",
      "private-hex",
      "public-hex",
      "apply-hex",
      "save-keypair",
      "restore-file",
      "spki-format",
      "export-public",
    ]) {
      expect(root.querySelector(`[data-testid="${id}"]`), id).toBeTruthy();
    }
    // Curve dropdown offers the three NIST curves, defaulting to P-521.
    expect(root.querySelectorAll('[data-testid="curve"] option')).toHaveLength(3);
    expect((root.querySelector('[data-testid="curve"]') as HTMLSelectElement).value).toBe("P-521");
    // Public export format offers PEM, DER and HEX.
    expect(root.querySelectorAll('[data-testid="spki-format"] option')).toHaveLength(3);
  });

  it("blocks reconstruction when only one hex field is filled", () => {
    const root = mount(renderEcKeypair);
    const priv = root.querySelector('[data-testid="private-hex"]') as HTMLTextAreaElement;
    const status = root.querySelector('[data-testid="status"]') as HTMLElement;

    priv.value = "00".repeat(32); // public left empty
    (root.querySelector('[data-testid="apply-hex"]') as HTMLButtonElement).click();

    expect(status.textContent).toMatch(/both private and public/i);
    expect(getKeyPair()).toBeNull();
  });
});
