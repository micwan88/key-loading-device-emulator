// Export key page — wrap the selected key into a TR-31 key block under a ZMK.

import { hexToBytes } from "../lib/ec.ts";
import { getKey } from "../lib/key-store.ts";
import { listZmks, getZmk, type Zmk } from "../lib/zmk-store.ts";
import { wrapTr31, KEY_USAGES, MODES_OF_USE, EXPORTABILITIES } from "../lib/tr31.ts";
import { buildKeyCsv } from "../lib/key-tmd.ts";

// Selection passed from the list page (router has no query params).
let targetId: string | null = null;
export function setExportTarget(id: string): void {
  targetId = id;
}

// ZMK option label: "{ID}: {Type} ({KCV})" with optional " - (EMV: {EMV KCV})".
function zmkLabel(z: Zmk): string {
  const emv = z.emvKcv ? ` - (EMV: ${z.emvKcv})` : "";
  return `${z.zmkId}: ${z.type} (${z.kcv})${emv}`;
}

function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// UTC yyyy_mm_dd_HH_MM for the export CSV filename.
function csvTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}_${p(d.getUTCMonth() + 1)}_${p(d.getUTCDate())}_${p(d.getUTCHours())}_${p(d.getUTCMinutes())}`;
}

export function renderKeyExport(root: HTMLElement): void {
  const key = targetId ? getKey(targetId) : undefined;
  const input = "w-full rounded border border-line bg-elevated px-3 py-2 font-mono text-xs break-all";
  const select = "rounded border border-line bg-elevated px-3 py-2";

  if (!key) {
    root.innerHTML = `
      <section class="mx-auto max-w-3xl p-6">
        <a href="#/keys" class="text-sm text-muted hover:underline">&larr; Back to Keys</a>
        <p data-testid="no-key" class="text-muted mt-4">No key selected. Pick a key from the list, then click Export.</p>
      </section>`;
    return;
  }

  const zmks = listZmks();

  root.innerHTML = `
    <section class="mx-auto max-w-3xl p-6">
      <a href="#/keys" data-testid="back" class="text-sm text-muted hover:underline">&larr; Back to Keys</a>
      <h1 class="text-2xl font-bold mt-2 mb-6">Export Key</h1>

      <div class="rounded-lg border border-line bg-surface p-4 grid gap-2 text-sm mb-4">
        <div><span class="text-muted">Key ID: </span><span data-testid="prop-id" class="text-content">${key.keyId}</span></div>
        <div><span class="text-muted">Type: </span><span data-testid="prop-type" class="text-content">${key.type}</span></div>
        <div><span class="text-muted">Key (HEX): </span><span data-testid="prop-key" class="font-mono text-xs break-all text-content">${key.keyHex}</span></div>
        <div><span class="text-muted">KCV: </span><span data-testid="prop-kcv" class="font-mono text-content">${key.kcv}</span></div>
        ${key.emvKcv ? `<div><span class="text-muted">EMV KCV: </span><span data-testid="prop-emv-kcv" class="font-mono text-content">${key.emvKcv}</span></div>` : ""}
      </div>

      <div class="grid gap-4">
        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Protection Key</span>
          <select data-testid="zmk-select" class="${select}" ${zmks.length ? "" : "disabled"}>
            ${
              zmks.length
                ? zmks.map((z) => `<option value="${z.id}">${zmkLabel(z)}</option>`).join("")
                : `<option value="">No ZMKs available — derive one first</option>`
            }
          </select>
        </label>

        <div class="grid gap-4">
          <label class="flex flex-col text-sm">
            <span class="mb-1 text-muted">Key usage</span>
            <select data-testid="key-usage" class="${select}">
              ${KEY_USAGES.map((u) => `<option value="${u.code}">${u.code} — ${u.label}</option>`).join("")}
            </select>
          </label>
          <label class="flex flex-col text-sm">
            <span class="mb-1 text-muted">Mode of use</span>
            <select data-testid="mode-of-use" class="${select}">
              ${MODES_OF_USE.map((m) => `<option value="${m.code}">${m.code} — ${m.label}</option>`).join("")}
            </select>
          </label>
          <label class="flex flex-col text-sm">
            <span class="mb-1 text-muted">Exportability</span>
            <select data-testid="exportability" class="${select}">
              ${EXPORTABILITIES.map((e) => `<option value="${e.code}">${e.code} — ${e.label}</option>`).join("")}
            </select>
          </label>
        </div>

        <button data-testid="do-export" class="rounded bg-accent px-4 py-2 text-accent-contrast font-medium hover:opacity-90 disabled:opacity-40"
          ${zmks.length ? "" : "disabled"}>Export to TR-31 key block</button>

        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">TR-31 key block (uppercase)</span>
          <textarea data-testid="keyblock-out" rows="3" readonly class="${input}"></textarea>
        </label>

        <section class="rounded-lg border border-line bg-surface p-4">
          <h2 class="font-semibold mb-1">Thales PayShield Trusted Management Device (TMD)</h2>
          <p class="text-muted text-sm mb-4">Export key to Thales TMD</p>
          <div class="grid gap-4">
            <label class="flex flex-col text-sm">
              <span class="mb-1 text-muted">Key name</span>
              <input data-testid="key-name" type="text" class="${input} font-sans" />
            </label>
            <button data-testid="export-csv" class="rounded border border-line px-4 py-2 hover:bg-elevated disabled:opacity-40 self-start"
              ${zmks.length ? "" : "disabled"}>Export key csv</button>
          </div>
        </section>

        <p data-testid="status" role="status" class="text-sm min-h-5"></p>
      </div>
    </section>
  `;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(`[data-testid="${sel}"]`) as T;
  const statusEl = $<HTMLParagraphElement>("status");
  const outEl = $<HTMLTextAreaElement>("keyblock-out");

  function setStatus(msg: string, kind: "ok" | "error" = "ok"): void {
    statusEl.textContent = msg;
    statusEl.className = `text-sm min-h-5 ${kind === "error" ? "text-danger" : "text-success"}`;
  }

  // Wrap the key into a TR-31 block under the currently selected ZMK + options.
  function wrapWithSelectedZmk(zmk: Zmk): string {
    return wrapTr31({
      kbpkType: zmk.type,
      kbpk: hexToBytes(zmk.keyHex),
      keyType: key!.type,
      key: hexToBytes(key!.keyHex),
      keyUsage: $<HTMLSelectElement>("key-usage").value,
      modeOfUse: $<HTMLSelectElement>("mode-of-use").value,
      exportability: $<HTMLSelectElement>("exportability").value,
    });
  }

  $("do-export").addEventListener("click", () => {
    const zmk = getZmk($<HTMLSelectElement>("zmk-select").value);
    if (!zmk) return setStatus("Select a ZMK to protect the key block.", "error");
    try {
      const block = wrapWithSelectedZmk(zmk);
      outEl.value = block;
      setStatus(`Exported under ZMK "${zmk.zmkId}" as version ${block[0]}.`);
    } catch (err) {
      setStatus(`Export failed: ${(err as Error).message}`, "error");
    }
  });

  $("export-csv").addEventListener("click", () => {
    const zmk = getZmk($<HTMLSelectElement>("zmk-select").value);
    if (!zmk) return setStatus("Select a ZMK to protect the key block.", "error");
    const keyName = $<HTMLInputElement>("key-name").value.trim();
    if (!keyName) return setStatus("Enter a key name before exporting the CSV.", "error");
    try {
      const block = wrapWithSelectedZmk(zmk);
      outEl.value = block;
      const now = new Date();
      const csv = buildKeyCsv({
        keyName,
        keyType: key!.type,
        kcv: key!.kcv,
        mzmkId: zmk.zmkId,
        mzmkKcv: zmk.kcv,
        tr31Block: block,
        date: now,
      });
      download(`export_key_${csvTimestamp(now)}.csv`, csv, "text/csv");
      setStatus(`Key CSV exported under ZMK "${zmk.zmkId}".`);
    } catch (err) {
      setStatus(`Export failed: ${(err as Error).message}`, "error");
    }
  });
}
