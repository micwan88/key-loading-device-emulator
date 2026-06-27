// Derive Zone Master Key page — story requirements 1-15.

import { getKeyPair } from "../lib/store.ts";
import { addZmk, hasZmkId, nextZmkId } from "../lib/zmk-store.ts";
import { hexToBytes, bytesToHex } from "../lib/ec.ts";
import {
  ZMK_TYPES,
  type ZmkType,
  deriveZmk,
  randomSharedInfo,
  publicPemToDer,
  buildMzmkCsv,
  parseMzmkCsv,
  type DerivedZmk,
} from "../lib/zmk.ts";

function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Local date/time as yyyy_mm_dd_HH_MM (24-hour, zero-padded) for the CSV filename.
function csvTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}_${p(d.getMonth() + 1)}_${p(d.getDate())}_${p(d.getHours())}_${p(d.getMinutes())}`;
}

export function renderZmkDerive(root: HTMLElement): void {
  const pair = getKeyPair();
  const input =
    "w-full rounded border border-line bg-elevated px-3 py-2 font-mono text-xs break-all";
  const btn = "rounded border border-line px-4 py-2 hover:bg-elevated disabled:opacity-40";

  root.innerHTML = `
    <section class="mx-auto max-w-3xl p-6">
      <a href="#/zmk" class="text-sm text-muted hover:underline">&larr; Back to ZMKs</a>
      <h1 class="text-2xl font-bold mt-2 mb-2">Derive Zone Master Key</h1>
      <p data-testid="derive-desc" class="text-muted mb-6">
        Derive a ZMK via ECDH key exchange (ANSI X9.63 KDF). ${
          pair
            ? `Current keypair curve: <span class="text-content font-medium">${pair.curve}</span>.`
            : `<span class="text-danger">No keypair in the app — create one on the EC Keypair page first.</span>`
        }
      </p>

      <div class="grid gap-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col text-sm grow">
            <span class="mb-1 text-muted">ZMK ID (1-5 digits)</span>
            <input data-testid="zmk-id" type="text" inputmode="numeric" maxlength="5" class="${input} font-sans" />
          </label>
          <button data-testid="gen-zmk-id" class="${btn}">Generate ZMK ID</button>
        </div>

        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Their public key (HEX of DER)</span>
          <textarea data-testid="their-public" rows="3" class="${input}"></textarea>
        </label>

        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col text-sm">
            <span class="mb-1 text-muted">Import public key file</span>
            <select data-testid="import-format" class="rounded border border-line bg-elevated px-3 py-2">
              <option value="pem">PEM</option>
              <option value="der">DER</option>
              <option value="hex">HEX</option>
            </select>
          </label>
          <label class="${btn} cursor-pointer">
            Restore public key from file
            <input data-testid="import-public-file" type="file" accept=".pem,.der,.hex,.txt" class="hidden" />
          </label>
        </div>

        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Shared secret (HEX)</span>
          <textarea data-testid="shared-secret" rows="3" class="${input}"></textarea>
        </label>

        <div class="flex flex-wrap items-end gap-3">
          <button data-testid="gen-shared" class="${btn}">Generate random shared secret</button>
          <label class="flex flex-col text-sm">
            <span class="mb-1 text-muted">ZMK type</span>
            <select data-testid="zmk-type" class="rounded border border-line bg-elevated px-3 py-2">
              ${ZMK_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
            </select>
          </label>
          <button data-testid="derive" class="rounded bg-accent px-4 py-2 text-accent-contrast font-medium hover:opacity-90 disabled:opacity-40"
            ${pair ? "" : "disabled"}>
            Derive ZMK
          </button>
        </div>

        <div class="rounded-lg border border-line bg-surface p-4 grid gap-2 text-sm">
          <div><span class="text-muted">Derived key (HEX): </span>
            <span data-testid="derived-key" class="font-mono text-xs break-all text-content"></span></div>
          <div><span class="text-muted">KCV: </span>
            <span data-testid="derived-kcv" class="font-mono text-content"></span></div>
          <div data-testid="derived-emv-kcv-row" class="hidden"><span class="text-muted">EMV KCV: </span>
            <span data-testid="derived-emv-kcv" class="font-mono text-content"></span></div>
        </div>

        <hr class="border-line my-4" />

        <section class="rounded-lg border border-line bg-surface p-4">
          <h2 class="font-semibold mb-1">Thales PayShield Trusted Management Device (TMD)</h2>
          <p class="text-muted text-sm mb-4">Exchange MZMK data with a Thales TMD.</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <span class="text-sm text-muted">Exchange your derived ZMK to Thales TMD</span>
              <button data-testid="gen-csv" class="${btn}" disabled>Generate MZMKdata CSV</button>
            </div>
            <div class="flex flex-col gap-2">
              <span class="text-sm text-muted">Derive the ZMK from Thales TMD</span>
              <label class="${btn} cursor-pointer text-center">
                Import MZMKdata CSV
                <input data-testid="exchange-file" type="file" accept=".csv" class="hidden" />
              </label>
            </div>
          </div>
        </section>

        <p data-testid="status" role="status" class="text-sm min-h-5"></p>
      </div>
    </section>
  `;

  const $ = <T extends HTMLElement>(sel: string) =>
    root.querySelector(`[data-testid="${sel}"]`) as T;

  const idEl = $<HTMLInputElement>("zmk-id");
  const theirPublicEl = $<HTMLTextAreaElement>("their-public");
  const sharedEl = $<HTMLTextAreaElement>("shared-secret");
  const typeEl = $<HTMLSelectElement>("zmk-type");
  const importFormatEl = $<HTMLSelectElement>("import-format");
  const derivedKeyEl = $<HTMLSpanElement>("derived-key");
  const derivedKcvEl = $<HTMLSpanElement>("derived-kcv");
  const derivedEmvKcvRowEl = $<HTMLDivElement>("derived-emv-kcv-row");
  const derivedEmvKcvEl = $<HTMLSpanElement>("derived-emv-kcv");
  const genCsvEl = $<HTMLButtonElement>("gen-csv");
  const statusEl = $<HTMLParagraphElement>("status");

  // Captured from the last successful derive+save, for MZMKdata CSV generation.
  let lastDerived: { sharedInfo: Uint8Array; kcv: string; type: ZmkType } | null = null;

  function setStatus(msg: string, kind: "ok" | "error" | "warn" = "ok"): void {
    statusEl.textContent = msg;
    const color = kind === "error" ? "text-danger" : kind === "warn" ? "text-danger" : "text-success";
    statusEl.className = `text-sm min-h-5 ${color}`;
  }

  function showDerived(d: DerivedZmk): void {
    derivedKeyEl.textContent = d.keyHex;
    derivedKcvEl.textContent = d.kcv;
    if (d.emvKcv) {
      derivedEmvKcvEl.textContent = d.emvKcv;
      derivedEmvKcvRowEl.classList.remove("hidden");
    } else {
      derivedEmvKcvEl.textContent = "";
      derivedEmvKcvRowEl.classList.add("hidden");
    }
  }

  function readSharedInfo(): Uint8Array {
    return hexToBytes(sharedEl.value);
  }

  // Validate a user-entered ZMK ID: 1-5 digits, numeric value >= 1, and unique.
  // Returns the trimmed ID or null (after setting an error status).
  function validateZmkId(): string | null {
    const id = idEl.value.trim();
    if (!/^\d{1,5}$/.test(id) || Number(id) < 1) {
      setStatus("ZMK ID must be 1-5 digits and cannot be zero.", "error");
      return null;
    }
    if (hasZmkId(id)) {
      setStatus(`ZMK ID "${id}" already exists. Choose a different ID.`, "error");
      return null;
    }
    return id;
  }

  // Generate a ZMK ID — increment from the current max.
  $("gen-zmk-id").addEventListener("click", () => {
    const next = nextZmkId();
    if (next > 99999) {
      setStatus("Cannot generate a ZMK ID: maximum (99999) reached.", "error");
      return;
    }
    idEl.value = String(next);
  });

  // (6) generate random shared secret (128 bytes)
  $("gen-shared").addEventListener("click", () => {
    sharedEl.value = bytesToHex(randomSharedInfo()).toUpperCase();
  });

  // (8)(9) restore their public key from PEM / DER / HEX file
  $<HTMLInputElement>("import-public-file").addEventListener("change", async (e) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    try {
      let der: Uint8Array;
      if (importFormatEl.value === "pem") {
        der = publicPemToDer(await file.text());
      } else if (importFormatEl.value === "hex") {
        der = hexToBytes(await file.text());
      } else {
        der = new Uint8Array(await file.arrayBuffer());
      }
      theirPublicEl.value = bytesToHex(der).toUpperCase();
      setStatus("Public key imported.");
    } catch (err) {
      setStatus(`Import failed: ${(err as Error).message}`, "error");
    } finally {
      el.value = "";
    }
  });

  // (10)(11)(12)(13) derive + display + save
  $("derive").addEventListener("click", async () => {
    const keyPair = getKeyPair();
    if (!keyPair) return setStatus("No keypair in the app.", "error");
    const zmkId = validateZmkId();
    if (!zmkId) return;
    try {
      const type = typeEl.value as ZmkType;
      const sharedInfo = readSharedInfo();
      const theirPublicDer = hexToBytes(theirPublicEl.value);
      const d = await deriveZmk({ ourKeyPair: keyPair, theirPublicDer, sharedInfo, type });
      showDerived(d);
      addZmk({ zmkId, type, keyHex: d.keyHex, kcv: d.kcv, emvKcv: d.emvKcv });
      lastDerived = { sharedInfo, kcv: d.kcv, type };
      genCsvEl.disabled = false;
      setStatus(`ZMK "${zmkId}" derived and saved.`);
    } catch (err) {
      setStatus(`Derive failed: ${(err as Error).message}`, "error");
    }
  });

  // (14) generate MZMKdata CSV
  genCsvEl.addEventListener("click", async () => {
    const keyPair = getKeyPair();
    if (!keyPair || !lastDerived) return;
    const now = new Date();
    const csv = await buildMzmkCsv({
      sharedInfo: lastDerived.sharedInfo,
      kcv: lastDerived.kcv,
      type: lastDerived.type,
      ourKeyPair: keyPair,
      date: now,
    });
    download(`MZMKdata_${csvTimestamp(now)}.csv`, csv, "text/csv");
    setStatus("MZMKdata CSV generated.");
  });

  // (14) exchange ZMK from other's MZMKdata CSV
  $<HTMLInputElement>("exchange-file").addEventListener("change", async (e) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    const keyPair = getKeyPair();
    try {
      if (!keyPair) return setStatus("No keypair in the app.", "error");
      const zmkId = validateZmkId();
      if (!zmkId) return;

      const parsed = parseMzmkCsv(await file.text());
      // Populate the corresponding fields.
      theirPublicEl.value = bytesToHex(parsed.theirPublicDer).toUpperCase();
      sharedEl.value = bytesToHex(parsed.sharedInfo).toUpperCase();
      typeEl.value = parsed.type;

      const d = await deriveZmk({
        ourKeyPair: keyPair,
        theirPublicDer: parsed.theirPublicDer,
        sharedInfo: parsed.sharedInfo,
        type: parsed.type,
      });
      showDerived(d);

      // AES keys may carry either the standard KCV or the EMV KCV in the file —
      // accept the key when the file value matches either one.
      const matches = parsed.kcv === d.kcv || (d.emvKcv !== undefined && parsed.kcv === d.emvKcv);
      if (!matches) {
        const expected = d.emvKcv ? `${d.kcv} or EMV ${d.emvKcv}` : d.kcv;
        setStatus(
          `KCV mismatch: file says ${parsed.kcv} but derived ${expected}. Key NOT saved.`,
          "warn",
        );
        return;
      }
      addZmk({ zmkId, type: parsed.type, keyHex: d.keyHex, kcv: d.kcv, emvKcv: d.emvKcv });
      lastDerived = { sharedInfo: parsed.sharedInfo, kcv: d.kcv, type: parsed.type };
      genCsvEl.disabled = false;
      setStatus(`ZMK "${zmkId}" exchanged and saved (KCV ${d.kcv}).`);
    } catch (err) {
      setStatus(`Exchange failed: ${(err as Error).message}`, "error");
    } finally {
      el.value = "";
    }
  });
}
