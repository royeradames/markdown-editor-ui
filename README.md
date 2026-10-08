# Markdown Editor — local documents

A browser-local Next.js migration of the existing Angular editor. Create, rename, explicitly save, search and delete Markdown documents; preview beside the editor, or alone with the eye toggle (on phones it swaps the single visible pane). No account, server document store, analytics, synchronization or offline-installation claim is included. Clearing site data removes the saved library; use Download draft for a portable Markdown copy.

## State and storage contract

- Saved records have stable UUID identities. The TanStack Form working copy is separate; typing does not mutate saved records. New documents start blank and unsaved. Switch/new/delete offer Save and continue, Discard changes or Cancel when needed. Delete separately names the selected document and supports Escape/focus restoration.
- Version 1 collection: at most 100 documents, 80 characters per name, 200,000 characters per document and 2,000,000 serialized UTF-8 bytes total. The selected ID must exist (or be null). Saved records, selection and light/dark theme share one revision.
- Writes acquire the origin-wide Web Lock and compare the exact previously-read storage bytes before replacing them. Stale tabs cannot overwrite document, selection or theme changes. A conflict preserves the current draft and offers reload/download. Browsers without Web Locks keep editing/download available but block unsafe persistence.
- Malformed data is not auto-replaced. Download its storage backup and current draft before explicitly confirming reset. Storage/quota failures preserve the prior saved bytes and the in-memory draft. Unsaved drafts are not durable after the tab/browser is lost.
- Storage is per origin and browser profile. Preview, production and another device do not share a library. No document names or contents are put into URLs, browser titles, analytics or network requests.

## Markdown policy

Pinned `react-markdown` 10.1.0 uses CommonMark and React elements. `skipHtml` is enabled, with no raw-HTML plugins. Links permit only absolute HTTP/HTTPS/mailto destinations without credentials/control characters; destinations are visible beside the link text. Links open only after a user action, in a separate tab with noreferrer/noopener. Arbitrary images become inert alternative text and never fetch their URL. Code remains text. Extended GFM syntax is not part of this increment.

Primary sources checked 7 October 2026:
- [react-markdown API/security](https://github.com/remarkjs/react-markdown#security) and [maintainer version manifest](https://github.com/remarkjs/react-markdown/blob/main/package.json)
- [Web Locks coordination](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
- [TanStack Form validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation)

## Preservation and design scope

`legacy/angular/` preserves every originally tracked file from public commit `238b1b4f02f55e482327d9c6d22005fb41fdec06`, including its package manifest/lock, original favicon and both source documents. Original `src/app/docs.ts` SHA256: `8f15d993d0457c91a8febc2d5479f8c8fc985b4381069d3b4a79d903068dc7ed`. The two example names and contents are copied verbatim into `lib/examples.ts`; only IDs and application metadata change. Their upstream-source attribution is historical, not proof of equality with the official challenge packet.

The layout follows the official design: document name in the header, a Documents drawer behind the menu button below 1100px (a persistent sidebar on desktop), an eye toggle for preview-only, and an editor that fills its column. Orange actions keep the darker #b54225 for text contrast. Body text and controls stay at 16px/44px, with 14px secondary labels where the design uses smaller type. Roboto, Roboto Slab and Roboto Mono (the official design's faces) come from pinned Fontsource variable packages and are served by `next/font/local` from the app's own origin; no remote font CSS is fetched. Icons come from the official challenge starter. Header, drawer, modal (centered, 4px radius, 50% black backdrop) and pane structure were checked against the decoded official Figma; full pixel fidelity is not claimed. The new SVG and generated raster/app-touch icon also require served-artifact inspection; no physical installation has been tested.

## Verification

Use Node 24.11.1 and npm. The root `package-lock.json` is committed; the old Angular lock stays under `legacy/angular/`. Playwright 1.58.2 drives the system Google Chrome (`channel: "chrome"`), so no browser download is needed.

```sh
npm ci
npm run lint
npm run typecheck
npm run test        # domain/storage unit tests (node:test)
npm run build
npm run test:e2e    # Playwright specs in tests/*.spec.ts; starts its own server on 127.0.0.1:4422
```

The older journey suite needs a running production server. In a separate terminal:

```sh
npm run start -- --hostname 127.0.0.1 --port 4422
MARKDOWN_EDITOR_URL=http://127.0.0.1:4422 npm run test:browser
```

The browser helper accepts localhost only, uses only source examples and fictional documents, and writes screenshots to the ignored `.test-state/`. Stop the server afterward.

What passed on 7 October 2026 at commit `8bf7436` (on Mac2, and again on Mac1's independent fresh checkout): `npm ci`, lint with 0 errors (only old `import/no-anonymous-default-export` warnings: 1 in the Mac2 worktree, 2 on Mac1's checkout), typecheck clean, build OK, unit tests 10/10, Playwright specs 15/15 and the browser suite 16/16. The Playwright specs hold the regression tests for the centered dialogs, matching status/list labels, busy-not-disabled saving, the Documents drawer and Escape, the header/eye-toggle/editor-fill/font structure, and the site name metadata. Each failed on `03939bb` before its fix.

The repository's production branch is **master**. No production release is part of this branch.
