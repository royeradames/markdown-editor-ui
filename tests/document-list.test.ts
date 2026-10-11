import { test } from "node:test";
import assert from "node:assert/strict";
import { documentList, LIST_STEP, SEARCH_ABOVE, type Document } from "../lib/documents.ts";

// Synthetic libraries, oldest first as they are stored: doc-1 was created first.
function library(count: number): Document[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `doc-${index + 1}.md`,
    content: "",
    createdAt: Date.UTC(2026, 0, 1) + index * 60_000,
    updatedAt: Date.UTC(2026, 0, 1) + index * 60_000,
  }));
}

for (const count of [1, 6]) {
  test(`${count} documents: every one is listed, newest first, with no search`, () => {
    const view = documentList(library(count), "", LIST_STEP);
    assert.equal(view.searchable, false);
    assert.equal(view.shown.length, count);
    assert.equal(view.shown[0]?.name, `doc-${count}.md`);
    assert.equal(view.shown.at(-1)?.name, "doc-1.md");
  });
}

for (const count of [30, 100]) {
  test(`${count} documents: search is offered, the newest ${LIST_STEP} show first and the rest follow in steps`, () => {
    const docs = library(count);
    const first = documentList(docs, "", LIST_STEP);
    assert.ok(count > SEARCH_ABOVE);
    assert.equal(first.searchable, true);
    assert.equal(first.total, count);
    assert.equal(first.matched, count);
    assert.deepEqual(first.shown.map((doc) => doc.name).slice(0, 2), [`doc-${count}.md`, `doc-${count - 1}.md`]);
    assert.equal(first.shown.length, LIST_STEP);
    const all = documentList(docs, "", count + LIST_STEP);
    assert.equal(all.shown.length, count);
    assert.equal(all.shown.at(-1)?.name, "doc-1.md");
  });

  test(`${count} documents: search matches names case-insensitively and ignores surrounding spaces`, () => {
    const view = documentList(library(count), "  DOC-2  ", LIST_STEP);
    const expected = library(count).filter((doc) => doc.name.includes("doc-2")).length;
    assert.equal(view.matched, expected);
    assert.ok(view.shown.every((doc) => doc.name.includes("doc-2")));
    assert.equal(documentList(library(count), "no-such-name", LIST_STEP).matched, 0);
  });
}

test("documents saved before createdAt existed sort by their last save", () => {
  const [older, newer] = library(2);
  assert.ok(older && newer);
  const legacy = { ...older, createdAt: undefined, updatedAt: newer.updatedAt + 1 };
  assert.deepEqual(documentList([legacy, newer], "", LIST_STEP).shown.map((doc) => doc.name), ["doc-1.md", "doc-2.md"]);
});

test("documents created at the same moment keep their stored order", () => {
  const [a, b] = library(2);
  assert.ok(a && b);
  const same = [{ ...a, createdAt: 5 }, { ...b, createdAt: 5 }];
  assert.deepEqual(documentList(same, "", LIST_STEP).shown.map((doc) => doc.name), ["doc-1.md", "doc-2.md"]);
});

test("the open document stays listed after the shown rows, and only once", () => {
  const docs = library(100);
  const oldest = "00000000-0000-4000-8000-000000000001";
  const view = documentList(docs, "", LIST_STEP, oldest);
  assert.equal(view.shown.length, LIST_STEP + 1);
  assert.equal(view.shown.at(-1)?.id, oldest);
  assert.equal(documentList(docs, "", 100, oldest).shown.filter((doc) => doc.id === oldest).length, 1);
  assert.equal(documentList(docs, "", LIST_STEP, "00000000-0000-4000-8000-000000000100").shown.length, LIST_STEP);
  // A search that leaves the open document out doesn't bring it back.
  assert.ok(documentList(docs, "doc-5", LIST_STEP, oldest).shown.every((doc) => doc.name.includes("doc-5")));
});
