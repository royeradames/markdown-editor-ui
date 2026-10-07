# Markdown Editor — local documents

A browser-local Next.js migration of the existing Angular editor. Create, rename, explicitly save, search and delete Markdown documents; preview beside the editor or in an expanded/mobile view. No account, server document store, analytics, synchronization or offline-installation claim is included. Clearing site data removes the saved library; use Download draft for a portable Markdown copy.

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

Gray/orange colors, separate monospaced editor/serif preview and desktop/mobile modes follow the existing source direction, with 16px text and 44px controls. Fonts use local/platform fallbacks; no remote font CSS is fetched. The official PRO starter/design archive is still missing. Visual fidelity to that packet remains unverified. The new SVG and generated raster/app-touch icon also require served-artifact inspection; no physical installation has been tested.

## Verification gate (prepared, not yet run)

Use Node 24.11.1 and npm. Source preparation intentionally did not install packages, generate the new lockfile, run checks or publish a candidate. The first authorized execution must resolve/install this manifest and generate its root lockfile; the old Angular lock stays under `legacy/angular/`.

```sh
npm install
npm run test
npm run lint
npm run typecheck
npm run build
npm run start -- --port 4394
```

In a separate terminal, with an approved local browser slot:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs MARKDOWN_EDITOR_URL=http://127.0.0.1:4394 npm run test:browser
```

The browser helper deliberately accepts localhost only. Any protected Preview gate must use a separately reviewed exact-origin authentication wrapper, without putting credentials in files or broad request headers. Tests use only source examples and fictional documents. Close the owned server/browser afterward.

Required evidence before readiness: domain/storage tests, types/lint/build, production dependency audit, actual browser journeys including two tabs and hostile Markdown, both themes at 400/768/1440, keyboard/native-dialog focus, no-JS readable source example, image/network policy and screenshots. After independent source review and authorized publication, verify the exact Git-head Preview, native Vercel completion comment and all pending rendered behavior. The repository's production branch is **master**. No provider change or production release is authorized by this source artifact.
