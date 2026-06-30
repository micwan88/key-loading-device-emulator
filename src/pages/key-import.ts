// Import key page — unwrap a TR-31 key block (version B/D) under a chosen ZMK.

import { navigate } from "../router.ts";
import { hexToBytes } from "../lib/ec.ts";
import { computeKcv, computeEmvKcv } from "../lib/zmk.ts";
import { addKey, hasKeyId, nextKeyId } from "../lib/key-store.ts";
import { listZmks, getZmk, type Zmk } from "../lib/zmk-store.ts";
import { unwrapTr31 } from "../lib/tr31.ts";
import { parseKeyCsv, KEY_ALGORITHM_TO_TYPE } from "../lib/key-tmd.ts";

// ZMK option label: "{ID}: {Type} ({KCV})" with optional " - (EMV: {EMV KCV})".
function zmkLabel(z: Zmk): string {
  const emv = z.emvKcv ? ` - (EMV: ${z.emvKcv})` : "";
  return `${z.zmkId}: ${z.type} (${z.kcv})${emv}`;
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
          <span class="mb-1 text-muted">Protection Key</span>
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

        <hr class="border-line my-4" />

        <section class="rounded-lg border border-line bg-surface p-4">
          <h2 class="font-semibold mb-1">Thales PayShield Trusted Management Device (TMD)</h2>
          <p class="text-muted text-sm mb-4">Import key from Thales TMD</p>
          <label class="${btn} cursor-pointer text-center self-start inline-block ${zmks.length ? "" : "opacity-40 pointer-events-none"}">
            Import key csv
            <input data-testid="import-csv-file" type="file" accept=".csv" class="hidden" ${zmks.length ? "" : "disabled"} />
          </label>
        </section>

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

  // Validate the Key ID field (1-5 digits, >= 1, unique). Returns it or null (+status).
  function validateKeyId(): string | null {
    const id = idEl.value.trim();
    if (!/^\d{1,5}$/.test(id) || Number(id) < 1) {
      setStatus("Key ID must be 1-5 digits and cannot be zero.", "error");
      return null;
    }
    if (hasKeyId(id)) {
      setStatus(`Key ID "${id}" already exists. Choose a different ID.`, "error");
      return null;
    }
    return id;
  }

  // Unwrap a TR-31 block under the given ZMK and persist it, then go to the list.
  function saveUnwrapped(id: string, zmk: Zmk, block: string): void {
    const out = unwrapTr31(block, zmk.type, hexToBytes(zmk.keyHex));
    addKey({
      keyId: id,
      type: out.keyType,
      keyHex: out.keyHex,
      kcv: computeKcv(out.keyType, out.key),
      emvKcv: out.keyType.startsWith("AES") ? computeEmvKcv(out.key) : undefined,
    });
    navigate("/keys");
  }

  $("do-import").addEventListener("click", () => {
    const id = validateKeyId();
    if (!id) return;
    const zmk = getZmk($<HTMLSelectElement>("zmk-select").value);
    if (!zmk) return setStatus("Select a ZMK to unwrap the key block.", "error");
    try {
      saveUnwrapped(id, zmk, $<HTMLTextAreaElement>("keyblock").value);
    } catch (err) {
      setStatus(`Import failed: ${(err as Error).message}`, "error");
    }
  });

  // TMD: import a key from a Thales key-exchange CSV.
  $<HTMLInputElement>("import-csv-file").addEventListener("change", async (e) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    try {
      // (1) Key ID present + valid.
      const id = validateKeyId();
      if (!id) return;
      const zmk = getZmk($<HTMLSelectElement>("zmk-select").value);
      if (!zmk) return setStatus("Select a ZMK to unwrap the key block.", "error");

      // (2) CSV format.
      const parsed = parseKeyCsv(await file.text());

      // (3) ALGORITHM scheme matches the TR-31 header algorithm char (T/A).
      const algoType = KEY_ALGORITHM_TO_TYPE[parsed.algorithmScheme];
      if (!algoType) {
        return setStatus(`Unknown ALGORITHM: ${parsed.algorithmScheme}.`, "error");
      }
      const expectedAlgoChar = algoType.startsWith("AES") ? "A" : "T";
      if (parsed.tr31Block[7] !== expectedAlgoChar) {
        return setStatus(
          `ALGORITHM "${parsed.algorithmScheme}" does not match the key block algorithm '${parsed.tr31Block[7]}'.`,
          "error",
        );
      }

      // (4) MZMK CHECK VALUE matches the selected ZMK (standard or EMV KCV).
      const zmkMatch = parsed.mzmkCheckValue === zmk.kcv || parsed.mzmkCheckValue === zmk.emvKcv;
      if (!zmkMatch) {
        return setStatus(
          `MZMK CHECK VALUE ${parsed.mzmkCheckValue} does not match the selected ZMK (${zmk.kcv}). Key NOT imported.`,
          "error",
        );
      }

      // (5) Decrypt — unwrapTr31 checks supported version + length + MAC.
      const out = unwrapTr31(parsed.tr31Block, zmk.type, hexToBytes(zmk.keyHex));

      // (6) ALGORITHM matches the recovered key length/type.
      if (out.keyType !== algoType) {
        return setStatus(
          `ALGORITHM "${parsed.algorithmScheme}" does not match the recovered key (${out.keyType}).`,
          "error",
        );
      }

      // (7) CHECK VALUE matches the recovered key's KCV (or EMV KCV for AES).
      const kcv = computeKcv(out.keyType, out.key);
      const emvKcv = out.keyType.startsWith("AES") ? computeEmvKcv(out.key) : undefined;
      if (parsed.checkValue !== kcv && parsed.checkValue !== emvKcv) {
        return setStatus(
          `CHECK VALUE ${parsed.checkValue} does not match the recovered key (${kcv}). Key NOT imported.`,
          "error",
        );
      }

      addKey({ keyId: id, type: out.keyType, keyHex: out.keyHex, kcv, emvKcv });
      navigate("/keys");
    } catch (err) {
      setStatus(`Import failed: ${(err as Error).message}`, "error");
    } finally {
      el.value = "";
    }
  });
}
