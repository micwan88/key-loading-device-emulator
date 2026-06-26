import "./style.css";
import { createRouter, type Route } from "./router.ts";
import { applyTheme } from "./lib/theme.ts";
import { renderLanding } from "./pages/landing.ts";
import { renderEcKeypair } from "./pages/ec-keypair.ts";
import { renderZmkList } from "./pages/zmk-list.ts";
import { renderZmkDerive } from "./pages/zmk-derive.ts";

applyTheme();

const routes: Route[] = [
  { path: "/", title: "Home", render: renderLanding },
  { path: "/ec-keypair", title: "EC Keypair", render: renderEcKeypair },
  { path: "/zmk", title: "ZMK", render: renderZmkList },
  { path: "/zmk/derive", title: "Derive ZMK", render: renderZmkDerive },
];

const NAV = [
  { path: "#/", label: "Home" },
  { path: "#/ec-keypair", label: "EC Keypair" },
  { path: "#/zmk", label: "ZMK" },
];

const app = document.getElementById("app")!;
app.innerHTML = `
  <header class="border-b border-line bg-surface">
    <div class="mx-auto max-w-3xl px-6 py-3 flex items-center gap-6">
      <span class="font-bold">KLD Emulator</span>
      <nav class="flex gap-4 text-sm" data-testid="nav">
        ${NAV.map(
          (n) => `<a href="${n.path}" data-path="${n.path}" class="text-muted hover:text-content">${n.label}</a>`,
        ).join("")}
      </nav>
    </div>
  </header>
  <main id="view"></main>
`;

function updateActiveNav(): void {
  const current = `#${location.hash.replace(/^#/, "") || "/"}`;
  app.querySelectorAll<HTMLAnchorElement>("[data-path]").forEach((a) => {
    const active = a.dataset.path === current;
    a.className = `${active ? "text-accent" : "text-muted hover:text-content"}`;
  });
}
window.addEventListener("hashchange", updateActiveNav);

const view = document.getElementById("view")!;
const router = createRouter(routes, view);
void router.start();
updateActiveNav();
