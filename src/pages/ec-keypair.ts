// EC Keypair page — implements story requirements 1-10.

import {
  CURVES,
  type CurveName,
  type SpkiFormat,
  generateKeyPair,
  privateKeyToHex,
  publicKeyToHex,
  keyPairFromHex,
  exportKeyPairPkcs8Pem,
  importKeyPairFromPkcs8Pem,
  exportPublicSpki,
} from "../lib/ec.ts";
import { getKeyPair, setKeyPair } from "../lib/store.ts";

function download(filename: string, data: string | Uint8Array, mime: string): void {
  const part: BlobPart =
    typeof data === "string" ? data : new Blob([new Uint8Array(data)]);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function renderEcKeypair(root: HTMLElement): void {
  root.innerHTML = `
    <section class="mx-auto max-w-3xl p-6">
      <h1 class="text-2xl font-bold mb-6">EC Keypair</h1>

      <div class="flex flex-wrap items-end gap-3 mb-6">
        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Curve</span>
          <select data-testid="curve" class="rounded border border-line bg-elevated px-3 py-2">
            ${CURVES.map(
              (c) => `<option value="${c}"${c === "P-521" ? " selected" : ""}>${c}</option>`,
            ).join("")}
          </select>
        </label>
        <button data-testid="generate"
          class="rounded bg-accent px-4 py-2 text-accent-contrast font-medium hover:opacity-90">
          Generate keypair
        </button>
      </div>

      <div class="grid gap-4 mb-4">
        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Private key (HEX scalar)</span>
          <textarea data-testid="private-hex" rows="3"
            class="rounded border border-line bg-elevated px-3 py-2 font-mono text-xs break-all"></textarea>
        </label>
        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Public key (HEX, uncompressed 04||x||y)</span>
          <textarea data-testid="public-hex" rows="3"
            class="rounded border border-line bg-elevated px-3 py-2 font-mono text-xs break-all"></textarea>
        </label>
        <div>
          <button data-testid="apply-hex"
            class="rounded border border-line px-4 py-2 hover:bg-elevated">
            Apply pasted HEX
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3 mb-6 border-t border-line pt-6">
        <button data-testid="save-keypair"
          class="rounded border border-line px-4 py-2 hover:bg-elevated">
          Save keypair (PKCS#8 PEM)
        </button>
        <label class="rounded border border-line px-4 py-2 hover:bg-elevated cursor-pointer">
          Restore keypair from file
          <input data-testid="restore-file" type="file" accept=".pem,.key,.txt" class="hidden" />
        </label>
        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Public export format</span>
          <select data-testid="spki-format" class="rounded border border-line bg-elevated px-3 py-2">
            <option value="pem">PEM</option>
            <option value="der">DER</option>
            <option value="hex">HEX</option>
          </select>
        </label>
        <button data-testid="export-public"
          class="rounded border border-line px-4 py-2 hover:bg-elevated">
          Export public key (X.509)
        </button>
      </div>

      <p data-testid="status" role="status" class="text-sm min-h-5"></p>
    </section>
  `;

  const $ = <T extends HTMLElement>(sel: string) =>
    root.querySelector(`[data-testid="${sel}"]`) as T;

  const curveEl = $<HTMLSelectElement>("curve");
  const privateEl = $<HTMLTextAreaElement>("private-hex");
  const publicEl = $<HTMLTextAreaElement>("public-hex");
  const statusEl = $<HTMLParagraphElement>("status");
  const formatEl = $<HTMLSelectElement>("spki-format");
  const restoreEl = $<HTMLInputElement>("restore-file");

  function setStatus(msg: string, isError = false): void {
    statusEl.textContent = msg;
    statusEl.className = `text-sm min-h-5 ${isError ? "text-danger" : "text-success"}`;
  }

  async function showKeyPair(): Promise<void> {
    const pair = getKeyPair();
    if (!pair) return;
    curveEl.value = pair.curve;
    privateEl.value = (await privateKeyToHex(pair)).toUpperCase();
    publicEl.value = (await publicKeyToHex(pair)).toUpperCase();
  }

  // Restore display from the store on (re)entering the page — req 9.
  void showKeyPair();

  // (1) generate, (2) curve dropdown, (3) display hex
  $("generate").addEventListener("click", async () => {
    try {
      const pair = await generateKeyPair(curveEl.value as CurveName);
      setKeyPair(pair);
      await showKeyPair();
      setStatus(`Generated ${pair.curve} keypair.`);
    } catch (e) {
      setStatus(`Generate failed: ${(e as Error).message}`, true);
    }
  });

  // (4) reconstruct from pasted HEX — both fields required
  $("apply-hex").addEventListener("click", async () => {
    const priv = privateEl.value.trim();
    const pub = publicEl.value.trim();
    if (!priv || !pub) {
      setStatus(
        "Both private and public HEX are required (a private key alone cannot derive the public key).",
        true,
      );
      return;
    }
    try {
      const pair = await keyPairFromHex(priv, pub, curveEl.value as CurveName);
      setKeyPair(pair);
      setStatus("Keypair loaded from pasted HEX.");
    } catch (e) {
      setStatus(`Invalid HEX: ${(e as Error).message}`, true);
    }
  });

  // (5)(6) save keypair to PKCS#8 PEM file
  $("save-keypair").addEventListener("click", async () => {
    const pair = getKeyPair();
    if (!pair) {
      setStatus("No keypair to save. Generate or paste one first.", true);
      return;
    }
    const pem = await exportKeyPairPkcs8Pem(pair);
    download(`ec-keypair-${pair.curve}.pkcs8.pem`, pem, "application/x-pem-file");
    setStatus("Keypair saved (PKCS#8 PEM).");
  });

  // (7) restore keypair from PKCS#8 PEM file
  restoreEl.addEventListener("change", async () => {
    const file = restoreEl.files?.[0];
    if (!file) return;
    try {
      const pem = await file.text();
      const pair = await importKeyPairFromPkcs8Pem(pem);
      setKeyPair(pair);
      await showKeyPair();
      setStatus(`Keypair restored (${pair.curve}).`);
    } catch (e) {
      setStatus(`Restore failed: ${(e as Error).message}`, true);
    } finally {
      restoreEl.value = "";
    }
  });

  // (8)(10) export public key as X.509 SPKI, PEM or DER
  $("export-public").addEventListener("click", async () => {
    const pair = getKeyPair();
    if (!pair) {
      setStatus("No keypair to export. Generate or paste one first.", true);
      return;
    }
    const format = formatEl.value as SpkiFormat;
    const data = await exportPublicSpki(pair, format);
    if (format === "pem") {
      download(`ec-public-${pair.curve}.spki.pem`, data, "application/x-pem-file");
    } else if (format === "hex") {
      download(`ec-public-${pair.curve}.spki.hex.txt`, data, "text/plain");
    } else {
      download(`ec-public-${pair.curve}.spki.der`, data, "application/octet-stream");
    }
    setStatus(`Public key exported (X.509 SPKI ${format.toUpperCase()}).`);
  });
}
