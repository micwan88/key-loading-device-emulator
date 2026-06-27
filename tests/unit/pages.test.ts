import { describe, it, expect, beforeEach } from "vitest";
import { renderLanding } from "../../src/pages/landing.ts";
import { renderEcKeypair } from "../../src/pages/ec-keypair.ts";
import { getKeyPair, setKeyPair } from "../../src/lib/store.ts";

function mount(render: (root: HTMLElement) => void): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(root);
  return root;
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
