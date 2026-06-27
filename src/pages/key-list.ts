// Key Management list page — list, detail, delete, and entry to new/import/export.

import { navigate } from "../router.ts";
import { listKeys, getKey, deleteKey, type SymKey } from "../lib/key-store.ts";
import { setExportTarget } from "./key-export.ts";

export function renderKeyList(root: HTMLElement): void {
  let selectedId: string | null = null;
  const btn = "rounded border border-line px-4 py-2 hover:bg-elevated disabled:opacity-40 disabled:cursor-not-allowed";

  root.innerHTML = `
    <section class="mx-auto max-w-3xl p-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 class="text-2xl font-bold">Key Management</h1>
        <div class="flex gap-2">
          <button data-testid="new-key" class="rounded bg-accent px-4 py-2 text-accent-contrast font-medium hover:opacity-90">New</button>
          <button data-testid="import-key" class="${btn}">Import</button>
          <button data-testid="export-key" class="${btn}" disabled>Export</button>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <ul data-testid="key-list" class="grid gap-2"></ul>
        <div data-testid="key-detail" class="rounded-lg border border-line bg-surface p-4"></div>
      </div>
    </section>
  `;

  const listEl = root.querySelector('[data-testid="key-list"]') as HTMLUListElement;
  const detailEl = root.querySelector('[data-testid="key-detail"]') as HTMLDivElement;
  const exportBtn = root.querySelector('[data-testid="export-key"]') as HTMLButtonElement;

  function renderList(): void {
    const keys = listKeys();
    if (keys.length === 0) {
      listEl.innerHTML = `<li class="text-muted text-sm">No keys yet. Click "New" or "Import" to add one.</li>`;
      return;
    }
    listEl.innerHTML = keys
      .map(
        (k) => `
        <li>
          <button data-id="${k.id}" data-testid="key-item"
            class="w-full text-left rounded border px-3 py-2 transition ${
              k.id === selectedId ? "border-accent bg-elevated" : "border-line bg-surface hover:border-accent"
            }">
            <span class="font-medium text-content">${escapeHtml(k.keyId)}</span>
            <span class="text-xs text-muted ml-2">${k.type} (${k.kcv})</span>
          </button>
        </li>`,
      )
      .join("");
  }

  function renderDetail(): void {
    const k: SymKey | undefined = selectedId ? getKey(selectedId) : undefined;
    exportBtn.disabled = !k;
    if (!k) {
      detailEl.innerHTML = `<p class="text-muted text-sm">Select a key to see its details.</p>`;
      return;
    }
    detailEl.innerHTML = `
      <dl class="grid gap-3 text-sm">
        <div><dt class="text-muted">Key ID</dt><dd data-testid="detail-id" class="text-content">${escapeHtml(k.keyId)}</dd></div>
        <div><dt class="text-muted">Type</dt><dd data-testid="detail-type" class="text-content">${k.type}</dd></div>
        <div><dt class="text-muted">Key (HEX)</dt><dd data-testid="detail-key" class="font-mono text-xs break-all text-content">${k.keyHex}</dd></div>
        <div><dt class="text-muted">KCV</dt><dd data-testid="detail-kcv" class="font-mono text-content">${k.kcv}</dd></div>
        ${
          k.emvKcv
            ? `<div><dt class="text-muted">EMV KCV</dt><dd data-testid="detail-emv-kcv" class="font-mono text-content">${k.emvKcv}</dd></div>`
            : ""
        }
      </dl>
      <button data-testid="delete-key"
        class="mt-4 rounded border border-danger text-danger px-4 py-2 hover:bg-danger hover:text-base transition">
        Delete
      </button>
    `;
    (detailEl.querySelector('[data-testid="delete-key"]') as HTMLButtonElement).addEventListener("click", () => {
      deleteKey(k.id);
      selectedId = null;
      renderList();
      renderDetail();
    });
  }

  listEl.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest("[data-id]") as HTMLElement | null;
    if (!item) return;
    selectedId = item.dataset.id ?? null;
    renderList();
    renderDetail();
  });

  (root.querySelector('[data-testid="new-key"]') as HTMLButtonElement).addEventListener("click", () =>
    navigate("/keys/new"),
  );
  (root.querySelector('[data-testid="import-key"]') as HTMLButtonElement).addEventListener("click", () =>
    navigate("/keys/import"),
  );
  exportBtn.addEventListener("click", () => {
    if (!selectedId) return;
    setExportTarget(selectedId);
    navigate("/keys/export");
  });

  renderList();
  renderDetail();
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
