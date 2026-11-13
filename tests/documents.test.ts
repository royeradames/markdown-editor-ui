import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { addDocument, deleteDocument, documentDate, STARTER_CREATED_AT, hasUnsavedChanges, librarySchema, MAX_CONTENT, saveDocument } from "../lib/documents.ts";
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
  const final = addDocument(removed, fourthId, 2);
  assert.equal(new Set(final.documents.map((doc) => doc.id)).size, 3);
  assert.deepEqual(final.documents[0], first);
  assert.equal(exampleLibrary.documents.length, 2);
});
test("draft edits remain separate from saved records; an unknown record always counts as unsaved", () => {
  const saved = exampleLibrary.documents[1]; assert.ok(saved);
  assert.equal(hasUnsavedChanges(saved, saved), false);
  assert.equal(hasUnsavedChanges(saved, { ...saved, name: "renamed.md" }), true);
  assert.equal(hasUnsavedChanges(saved, { ...saved, content: "changed" }), true);
  assert.equal(hasUnsavedChanges(undefined, { name: "untitled-document.md", content: "" }), true);
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
test("the sample library is the official starter data.json, dated 01 April 2022", async () => {
  const raw = await readFile(new URL("../starter/data.json", import.meta.url), "utf8");
  const official = JSON.parse(raw) as { createdAt: string; name: string; content: string }[];
  assert.deepEqual(exampleLibrary.documents.map(({ name, content }) => ({ name, content })), official.map(({ name, content }) => ({ name, content })));
  for (const doc of exampleLibrary.documents) { assert.equal(doc.createdAt, STARTER_CREATED_AT); assert.equal(documentDate(doc), "01 April 2022"); }
  assert.ok(official.every((doc) => doc.createdAt === "04-01-2022"));
});

test("IDs are never reused: delete then add yields a new ID, and a duplicate ID is refused", () => {
  const added = addDocument(exampleLibrary, id, 10);
  const removed = deleteDocument(added, id);
  const nextId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const again = addDocument(removed, nextId, 20);
  assert.deepEqual(again.documents.map((doc) => doc.id), [...exampleLibrary.documents.map((doc) => doc.id), nextId]);
  assert.equal(again.selectedId, nextId);
  assert.throws(() => addDocument(again, nextId, 30));
});

test("saving keeps a document's creation date and stamps its update", () => {
  const added = addDocument(exampleLibrary, id, 1_000);
  const saved = saveDocument(added, id, { name: "renamed.md", content: "# Body" }, 5_000);
  const doc = saved.documents.find((item) => item.id === id);
  assert.equal(doc?.createdAt, 1_000); assert.equal(doc?.updatedAt, 5_000); assert.equal(doc?.name, "renamed.md");
});
