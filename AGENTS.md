# markdown-editor-ui: agent notes

## Styling: Tailwind first

Royer, Oct 28, 2026: "I was expecting us to use default tailwind classes for the most part and for us to have a justification and log it when we don't."

- Layout, spacing, sizing, colour tokens and type use Tailwind utilities. Write custom CSS only where Tailwind can't express it, and give each such rule a `/* why: ... */` comment.
- Build dynamic class names with `cn()` (clsx + tailwind-merge), never string concatenation or template literals, so conflicting utilities resolve and unused ones stay out. This repo has no cn() yet; add it at lib/utils.ts (clsx + tailwind-merge) in the first PR that needs a dynamic class.

## Installs and checks

- Bun is the package manager (`packageManager` in package.json, `bun.lock`). Install with `NPM_CONFIG_USERCONFIG=/dev/null ~/.bun/bin/bun install --frozen-lockfile`; don't add a package-lock.json.
- royer-merge reads `.affected-checks.json` for the change-scoped checks a PR runs. Checks marked `"boat": true` run on a boat box; add a check or a folder there in the PR that adds it.
