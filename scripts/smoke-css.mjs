// Post-deploy guard: the served stylesheets must contain this release's layout rules.
// On October 8, 2026 a restored build cache shipped the previous CSS beside new markup.
// Usage: node scripts/smoke-css.mjs https://markdown-editor-ui.royeradames.com/
const base = new URL(process.argv[2] ?? "https://markdown-editor-ui.royeradames.com/");
const required = [".app-frame{", ".menu-button{", ".sidebar{"];
const html = await (await fetch(base)).text();
const sheets = [...html.matchAll(/href="([^"]+\.css)"/g)].map(([, href]) => new URL(href, base).href);
if (!sheets.length) throw new Error(`No stylesheet linked from ${base.href}`);
const css = (await Promise.all([...new Set(sheets)].map(async (href) => (await fetch(href)).text()))).join("\n");
const missing = required.filter((rule) => !css.includes(rule));
if (missing.length) { console.error(`Stale or missing CSS at ${base.href}: ${missing.join(", ")} not found in ${sheets.join(", ")}`); process.exit(1); }
console.log(`CSS OK at ${base.href}: ${required.join(" ")} present`);
