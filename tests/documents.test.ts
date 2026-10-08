import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { deleteDocument, hasUnsavedChanges, isSourceExample, librarySchema, MAX_CONTENT, newDocument, saveDocument } from "../lib/documents.ts";
import { exampleLibrary } from "../lib/examples.ts";
import { readLibrary, STORAGE_KEY, writeLibrary, type Exclusive, type StoragePort } from "../lib/browser-storage.ts";
import { safeLink } from "../lib/markdown-policy.ts";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rev1 = "11111111-1111-4111-8111-111111111111";
const rev2 = "22222222-2222-4222-8222-222222222222";
function memory(initial: string | null = null): StoragePort {
  let raw = initial;
  return { getItem: () => raw, setItem: (_key, next) => { raw = next; } };
}
function mutex(): Exclusive {
  let tail: Promise<unknown> = Promise.resolve();
  return (work) => { const next = tail.then(work); tail = next.catch(() => undefined); return next; };
}

test("delete-middle/create uses UUID identity and does not mutate another document", () => {
  const first = exampleLibrary.documents[0]; const second = exampleLibrary.documents[1];
  assert.ok(first && second);
  const added = saveDocument(exampleLibrary, id, { name: "third.md", content: "third" }, 1);
  const removed = deleteDocument(added, second.id);
  const fourthId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const final = saveDocument(removed, fourthId, newDocument(fourthId), 2);
  assert.equal(new Set(final.documents.map((doc) => doc.id)).size, 3);
  assert.deepEqual(final.documents[0], first);
  assert.equal(exampleLibrary.documents.length, 2);
});
test("draft edits remain separate from saved records; new unsaved document always needs an intent decision", () => {
  const saved = exampleLibrary.documents[1]; assert.ok(saved);
  assert.equal(hasUnsavedChanges(saved, saved), false);
  assert.equal(hasUnsavedChanges(saved, { ...saved, name: "renamed.md" }), true);
  assert.equal(hasUnsavedChanges(saved, { ...saved, content: "changed" }), true);
  assert.equal(hasUnsavedChanges(undefined, newDocument(id)), true);
  assert.equal(saved.name, "welcome.md");
});
test("last-document deletion has a defined empty selection", () => {
  let shelf = exampleLibrary;
  for (const document of exampleLibrary.documents) shelf = deleteDocument(shelf, document.id);
  assert.deepEqual(shelf.documents, []); assert.equal(shelf.selectedId, null);
});
test("schema rejects duplicates, missing selected ID, oversized document and unsupported version", () => {
  assert.equal(librarySchema.safeParse({ ...exampleLibrary, documents: [...exampleLibrary.documents, exampleLibrary.documents[0]] }).success, false);
  assert.equal(librarySchema.safeParse({ ...exampleLibrary, selectedId: id }).success, false);
  assert.throws(() => saveDocument(exampleLibrary, id, { name: "large.md", content: "x".repeat(MAX_CONTENT + 1) }, 1));
  assert.equal(librarySchema.safeParse({ ...exampleLibrary, version: 2 }).success, false);
});
test("storage is bounded/validated and malformed input is never automatically replaced", () => {
  for (const raw of ["{", JSON.stringify({ version: 2 }), "x".repeat(2_000_001)]) {
    const storage = memory(raw); assert.equal(readLibrary(storage, exampleLibrary).kind, "invalid"); assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
});
test("two concurrent saves serialize and the stale writer cannot overwrite the first", async () => {
  const storage = memory(); const lock = mutex();
  const [first, second] = await Promise.all([
    writeLibrary(storage, lock, null, { ...exampleLibrary, theme: "dark" }, rev1),
    writeLibrary(storage, lock, null, { ...exampleLibrary, selectedId: exampleLibrary.documents[0]?.id ?? null }, rev2),
  ]);
  assert.equal(first.kind, "saved"); assert.equal(second.kind, "conflict");
  const actual = readLibrary(storage, exampleLibrary); assert.equal(actual.kind, "loaded");
  if (actual.kind === "loaded") { assert.equal(actual.snapshot.library.theme, "dark"); assert.equal(actual.snapshot.library.selectedId, exampleLibrary.selectedId); }
});
test("quota/denied storage and unavailable locks preserve prior bytes and report failure", async () => {
  const original = JSON.stringify(exampleLibrary);
  const full: StoragePort = { getItem: () => original, setItem: () => { throw new Error("quota"); } };
  assert.equal((await writeLibrary(full, mutex(), original, exampleLibrary, rev1)).kind, "failed");
  assert.equal(full.getItem(STORAGE_KEY), original);
  assert.equal((await writeLibrary(memory(original), null, original, exampleLibrary, rev1)).kind, "failed");
  const denied: StoragePort = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(readLibrary(denied, exampleLibrary).kind, "unavailable");
});
test("link policy rejects scripts, data, protocol-relative, credentials and control characters", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,<script>", "//example.com", "https://user:pass@example.com/", "https://example.com/\n", "/private", "vbscript:foo"]) assert.equal(safeLink(url), null);
  assert.equal(safeLink("https://example.com/doc"), "https://example.com/doc");
  assert.equal(safeLink("mailto:reader@example.com"), "mailto:reader@example.com");
});
test("both preserved examples still match their original source text", async () => {
  const raw = await readFile(new URL("../legacy/angular/src/app/docs.ts", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(raw).digest("hex"), "8f15d993d0457c91a8febc2d5479f8c8fc985b4381069d3b4a79d903068dc7ed");
  const entries = [...raw.matchAll(/title: '([^']+)',\s*content: `((?:\\.|[^`])*)`/gs)];
  assert.equal(entries.length, 2);
  for (const [index, entry] of entries.entries()) {
    assert.equal(exampleLibrary.documents[index]?.name, entry[1]);
    assert.equal(exampleLibrary.documents[index]?.content, entry[2]?.replaceAll("\\`", "`"));
  }
});

test("only a user save ends a source example; theme and selection writes do not", () => {
  const welcome = exampleLibrary.documents[1]; assert.ok(welcome);
  const themed = librarySchema.parse({ ...exampleLibrary, theme: "dark", selectedId: exampleLibrary.documents[0]?.id });
  assert.ok(themed.documents.every(isSourceExample));
  const saved = saveDocument(themed, welcome.id, { name: welcome.name, content: "# Mine" }, 1_700_000_000_000);
  assert.equal(isSourceExample(saved.documents.find((doc) => doc.id === welcome.id)!), false);
  assert.equal(isSourceExample(saved.documents.find((doc) => doc.id !== welcome.id)!), true);
});
