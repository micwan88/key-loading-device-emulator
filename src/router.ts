// Minimal hash-based router. Hash routing needs no server config, so it works
// as-is on GitHub Pages project sites.

export interface Route {
  path: string; // e.g. "/" or "/ec-keypair"
  title: string;
  render: (root: HTMLElement) => void | Promise<void>;
}

export function createRouter(routes: Route[], outlet: HTMLElement) {
  const notFound = routes[0];

  async function resolve() {
    const path = location.hash.replace(/^#/, "") || "/";
    const route = routes.find((r) => r.path === path) ?? notFound;
    outlet.innerHTML = "";
    await route.render(outlet);
  }

  window.addEventListener("hashchange", resolve);
  return { start: resolve };
}

export function navigate(path: string) {
  location.hash = path;
}
