// Export key page — wrap the selected key into a TR-31 key block under a ZMK.

import { hexToBytes } from "../lib/ec.ts";
import { getKey } from "../lib/key-store.ts";
import { listZmks, getZmk, type Zmk } from "../lib/zmk-store.ts";
import { wrapTr31, versionForKbpk, KEY_USAGES, MODES_OF_USE, EXPORTABILITIES } from "../lib/tr31.ts";

// Selection passed from the list page (router has no query params).
let targetId: string | null = null;
export function setExportTarget(id: string): void {
  targetId = id;
}

function zmkLabel(z: Zmk): string {
  const kcvs = z.emvKcv ? `KCV ${z.kcv} · EMV ${z.emvKcv}` : `KCV ${z.kcv}`;
  return `${z.zmkId} · ${z.type} · ${kcvs}`;
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
        <div><span class="text-muted">KCV: </span><span data-testid="prop-kcv" class="font-mono text-content">${key.kcv}</span></div>
        ${key.emvKcv ? `<div><span class="text-muted">EMV KCV: </span><span data-testid="prop-emv-kcv" class="font-mono text-content">${key.emvKcv}</span></div>` : ""}
      </div>

      <div class="grid gap-4">
        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Protect under ZMK (version is set by the ZMK type)</span>
          <select data-testid="zmk-select" class="${select}" ${zmks.length ? "" : "disabled"}>
            ${
              zmks.length
                ? zmks.map((z) => `<option value="${z.id}">${zmkLabel(z)} → version ${versionForKbpk(z.type)}</option>`).join("")
                : `<option value="">No ZMKs available — derive one first</option>`
            }
          </select>
        </label>

        <div class="grid gap-4 sm:grid-cols-3">
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

  $("do-export").addEventListener("click", () => {
    const zmk = getZmk($<HTMLSelectElement>("zmk-select").value);
    if (!zmk) return setStatus("Select a ZMK to protect the key block.", "error");
    try {
      const block = wrapTr31({
        kbpkType: zmk.type,
        kbpk: hexToBytes(zmk.keyHex),
        keyType: key.type,
        key: hexToBytes(key.keyHex),
        keyUsage: $<HTMLSelectElement>("key-usage").value,
        modeOfUse: $<HTMLSelectElement>("mode-of-use").value,
        exportability: $<HTMLSelectElement>("exportability").value,
      });
      outEl.value = block;
      setStatus(`Exported under ZMK "${zmk.zmkId}" as version ${block[0]}.`);
    } catch (err) {
      setStatus(`Export failed: ${(err as Error).message}`, "error");
    }
  });
}
