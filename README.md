# Markdown editor (Frontend Mentor: In-browser markdown editor)

Live: https://markdown-editor-ui.royeradames.com/

A Next.js build of the Frontend Mentor "In-browser markdown editor" challenge. Documents live in this browser's `localStorage`; there is no account, server copy or sync.

## What it does

- Create, read, update and delete Markdown documents. **+ New Document** adds a dated `untitled-document.md` to the list at once; **Delete** asks for confirmation in the design's modal.
- Name a document in the header and save it with **Save Changes**. Edits stay a draft until saved; switching documents with unsaved edits offers Save & Continue, Discard changes or Cancel.
- Edit beside a live preview, or use the eye toggle for a full-width preview. Phones show one pane at a time and the eye swaps them.
- The Documents drawer sits behind the menu button at every width and pushes the app 250px right, as in the design. Escape closes it and returns focus to the button.
- Light and dark themes from the switch in the drawer. A first visit follows the system setting; the choice is saved and painted before the page hydrates.
- First load shows the starter's two documents from `starter/data.json` (the challenge packet's `data.json`, verbatim), dated 01 April 2022.

## Design decisions

The layout, spacing and fonts (Roboto, Roboto Slab, Roboto Mono, served from this origin by `next/font/local`) follow the decoded official Figma at 375, 768 and 1440px. Deliberate differences:

- **16px floor.** The design's 13–15px labels, dates and preview text are set at 16px.
- **Contrast.** White text sits on `#b54225` rather than the design's `#e46643` (3.3:1), and body copy uses `#5a6069` rather than `#7c8187`. The design's orange stays for icons, borders and list markers.
- **Busy, not disabled.** While a save is pending, Save shows a spinner and "Saving…", stays focusable and ignores repeat presses; nothing is disabled. A hint appears if a save takes longer than 3 seconds.
- **A Cancel button** under Confirm & Delete, so the modal can be dismissed without a keyboard or a backdrop tap.

## Storage contract

- Every document has a UUID that is never reused, including after delete then add.
- Version 1 library: at most 100 documents, 80-character names, 200,000 characters per document and 2,000,000 bytes in total.
- Writes take an origin-wide Web Lock and compare the bytes read earlier, so a stale tab can't overwrite a newer save. A conflict keeps the draft and offers download or reload.
- Unreadable data is never replaced automatically: download its backup, then reset explicitly. Quota failures keep both the saved bytes and the draft.

## Markdown policy

`react-markdown` 10.1.0 with `skipHtml`. Links must be absolute http(s) or mailto without credentials and open in a new tab with `noopener noreferrer`. Images never load; they show their alt text. Code stays text.

## Verify

Node 24.11.1 and npm. Playwright 1.58.2 drives the installed Google Chrome (`channel: "chrome"`).

```sh
npm ci
npm run lint
npm run typecheck
npm run test        # domain and storage unit tests (node:test)
npm run build
npm run test:e2e    # Playwright: design, journeys, QA findings and regressions; starts its own server
```

`PW_PORT` (default 4422) and `PW_WORKERS` (default 1) adjust the Playwright server port and workers.

Vercel builds with `rm -rf .next/cache && npm run build` (`vercel.json`): on October 8, 2026 the restored build cache made Turbopack ship the previous release's CSS with the new markup, which broke production until a cache-free rebuild.

`legacy/angular/` keeps the original Angular app from commit `238b1b4`. The production branch is `master`.
