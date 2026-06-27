// New symmetric key page — manual entry or random generation.

import { navigate } from "../router.ts";
import { hexToBytes, bytesToHex } from "../lib/ec.ts";
import { ZMK_TYPES, ZMK_KEY_LEN, type ZmkType, computeKcv, computeEmvKcv } from "../lib/zmk.ts";
import { addKey, hasKeyId, nextKeyId } from "../lib/key-store.ts";

export function renderKeyNew(root: HTMLElement): void {
  const input = "w-full rounded border border-line bg-elevated px-3 py-2 font-mono text-xs break-all";
  const btn = "rounded border border-line px-4 py-2 hover:bg-elevated disabled:opacity-40";

  root.innerHTML = `
    <section class="mx-auto max-w-3xl p-6">
      <a href="#/keys" class="text-sm text-muted hover:underline">&larr; Back to Keys</a>
      <h1 class="text-2xl font-bold mt-2 mb-6">New Key</h1>

      <div class="grid gap-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col text-sm grow">
            <span class="mb-1 text-muted">Key ID (1-5 digits)</span>
            <input data-testid="key-id" type="text" inputmode="numeric" maxlength="5" class="${input} font-sans" />
          </label>
          <button data-testid="gen-key-id" class="${btn}">Generate Key ID</button>
        </div>

        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Key type</span>
          <select data-testid="key-type" class="rounded border border-line bg-elevated px-3 py-2">
            ${ZMK_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
          </select>
        </label>

        <label class="flex flex-col text-sm">
          <span class="mb-1 text-muted">Key value (HEX) — <span data-testid="key-hint"></span></span>
          <textarea data-testid="key-value" rows="2" class="${input}"></textarea>
        </label>

        <div class="flex flex-wrap items-end gap-3">
          <button data-testid="gen-key" class="${btn}">Generate random key</button>
          <button data-testid="save-key" class="rounded bg-accent px-4 py-2 text-accent-contrast font-medium hover:opacity-90">
            Save
          </button>
        </div>

        <p data-testid="status" role="status" class="text-sm min-h-5"></p>
      </div>
    </section>
  `;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(`[data-testid="${sel}"]`) as T;
  const idEl = $<HTMLInputElement>("key-id");
  const typeEl = $<HTMLSelectElement>("key-type");
  const valueEl = $<HTMLTextAreaElement>("key-value");
  const hintEl = $<HTMLSpanElement>("key-hint");
  const statusEl = $<HTMLParagraphElement>("status");

  function setStatus(msg: string, kind: "ok" | "error" = "ok"): void {
    statusEl.textContent = msg;
    statusEl.className = `text-sm min-h-5 ${kind === "error" ? "text-danger" : "text-success"}`;
  }

  // Max hex length (and hint) track the chosen type.
  function syncType(): void {
    const len = ZMK_KEY_LEN[typeEl.value as ZmkType];
    valueEl.maxLength = len * 2;
    hintEl.textContent = `${len * 2} hex chars (${len} bytes)`;
  }
  typeEl.addEventListener("change", syncType);
  syncType();

  $("gen-key-id").addEventListener("click", () => {
    const next = nextKeyId();
    if (next > 99999) return setStatus("Cannot generate a Key ID: maximum (99999) reached.", "error");
    idEl.value = String(next);
  });

  $("gen-key").addEventListener("click", () => {
    const bytes = new Uint8Array(ZMK_KEY_LEN[typeEl.value as ZmkType]);
    crypto.getRandomValues(bytes);
    valueEl.value = bytesToHex(bytes).toUpperCase();
  });

  $("save-key").addEventListener("click", () => {
    const id = idEl.value.trim();
    if (!/^\d{1,5}$/.test(id) || Number(id) < 1) {
      return setStatus("Key ID must be 1-5 digits and cannot be zero.", "error");
    }
    if (hasKeyId(id)) return setStatus(`Key ID "${id}" already exists. Choose a different ID.`, "error");

    const type = typeEl.value as ZmkType;
    const expectedLen = ZMK_KEY_LEN[type];
    let bytes: Uint8Array;
    try {
      bytes = hexToBytes(valueEl.value);
    } catch {
      return setStatus("Key value is not valid HEX.", "error");
    }
    if (bytes.length !== expectedLen) {
      return setStatus(`${type} needs exactly ${expectedLen} bytes (${expectedLen * 2} hex chars).`, "error");
    }

    addKey({
      keyId: id,
      type,
      keyHex: bytesToHex(bytes).toUpperCase(),
      kcv: computeKcv(type, bytes),
      emvKcv: type.startsWith("AES") ? computeEmvKcv(bytes) : undefined,
    });
    navigate("/keys");
  });
}
