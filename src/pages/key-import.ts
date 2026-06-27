// Import key page — unwrap a TR-31 key block (version B/D) under a chosen ZMK.

import { navigate } from "../router.ts";
import { hexToBytes } from "../lib/ec.ts";
import { computeKcv, computeEmvKcv } from "../lib/zmk.ts";
import { addKey, hasKeyId, nextKeyId } from "../lib/key-store.ts";
import { listZmks, getZmk, type Zmk } from "../lib/zmk-store.ts";
import { unwrapTr31 } from "../lib/tr31.ts";

function zmkLabel(z: Zmk): string {
  const kcvs = z.emvKcv ? `KCV ${z.kcv} · EMV ${z.emvKcv}` : `KCV ${z.kcv}`;
  return `${z.zmkId} · ${z.type} · ${kcvs}`;
}

export function renderKeyImport(root: HTMLElement): void {
  const input = "w-full rounded border border-line bg-elevated px-3 py-2 font-mono text-xs break-all";
  const btn = "rounded border border-line px-4 py-2 hover:bg-elevated disabled:opacity-40";
  const zmks = listZmks();

  root.innerHTML = `
    <section class="mx-auto max-w-3xl p-6">
      <a href="#/keys" class="text-sm text-muted hover:underline">&larr; Back to Keys</a>
      <h1 class="text-2xl font-bold mt-2 mb-6">Import Key</h1>

      <div class="grid gap-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col text-sm grow">
            <span class="mb-1 text-muted">Key ID (1-5 digits)</span>
            <input data-testid="key-id" type="text" inputmode="numeric" maxlength="5" class="${input} font-sans" />
          </label>
          <button data-testid="gen-key-id" class="${btn}">Generate Key ID</button>
        </div>

        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Protecting ZMK (showing ID, type, KCVs)</span>
          <select data-testid="zmk-select" class="rounded border border-line bg-elevated px-3 py-2" ${zmks.length ? "" : "disabled"}>
            ${
              zmks.length
                ? zmks.map((z) => `<option value="${z.id}">${zmkLabel(z)}</option>`).join("")
                : `<option value="">No ZMKs available — derive one first</option>`
            }
          </select>
        </label>

        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">TR-31 key block (HEX)</span>
          <textarea data-testid="keyblock" rows="3" class="${input}"></textarea>
        </label>

        <p data-testid="version-note" class="text-sm" style="color:#f59e0b">
          For simplicity, only TR-31 versions B and D are supported at this moment.
        </p>

        <button data-testid="do-import" class="rounded bg-accent px-4 py-2 text-accent-contrast font-medium hover:opacity-90 disabled:opacity-40"
          ${zmks.length ? "" : "disabled"}>Import</button>

        <p data-testid="status" role="status" class="text-sm min-h-5"></p>
      </div>
    </section>
  `;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(`[data-testid="${sel}"]`) as T;
  const idEl = $<HTMLInputElement>("key-id");
  const statusEl = $<HTMLParagraphElement>("status");

  function setStatus(msg: string, kind: "ok" | "error" = "ok"): void {
    statusEl.textContent = msg;
    statusEl.className = `text-sm min-h-5 ${kind === "error" ? "text-danger" : "text-success"}`;
  }

  $("gen-key-id").addEventListener("click", () => {
    const next = nextKeyId();
    if (next > 99999) return setStatus("Cannot generate a Key ID: maximum (99999) reached.", "error");
    idEl.value = String(next);
  });

  $("do-import").addEventListener("click", () => {
    const id = idEl.value.trim();
    if (!/^\d{1,5}$/.test(id) || Number(id) < 1) {
      return setStatus("Key ID must be 1-5 digits and cannot be zero.", "error");
    }
    if (hasKeyId(id)) return setStatus(`Key ID "${id}" already exists. Choose a different ID.`, "error");

    const zmk = getZmk($<HTMLSelectElement>("zmk-select").value);
    if (!zmk) return setStatus("Select a ZMK to unwrap the key block.", "error");

    try {
      const out = unwrapTr31($<HTMLTextAreaElement>("keyblock").value, zmk.type, hexToBytes(zmk.keyHex));
      addKey({
        keyId: id,
        type: out.keyType,
        keyHex: out.keyHex,
        kcv: computeKcv(out.keyType, out.key),
        emvKcv: out.keyType.startsWith("AES") ? computeEmvKcv(out.key) : undefined,
      });
      navigate("/keys");
    } catch (err) {
      setStatus(`Import failed: ${(err as Error).message}`, "error");
    }
  });
}
