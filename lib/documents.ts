import { z } from "zod";

export const MAX_DOCUMENTS = 100;
export const MAX_CONTENT = 200_000;
export const MAX_STORAGE_BYTES = 2_000_000;
export const draftSchema = z.object({
  name: z.string().trim().min(1, "Give the document a name.").max(80, "Use at most 80 characters."),
  content: z.string().max(MAX_CONTENT, "A document can contain at most 200,000 characters."),
});
// createdAt arrived after version 1 shipped; records saved before it fall back to updatedAt for display.
export const documentSchema = draftSchema.extend({ id: z.uuid(), createdAt: z.number().int().nonnegative().optional(), updatedAt: z.number().int().nonnegative() });
export const librarySchema = z.object({
  version: z.literal(1), revision: z.uuid(), documents: z.array(documentSchema).max(MAX_DOCUMENTS),
  selectedId: z.uuid().nullable(), theme: z.enum(["light", "dark"]),
}).superRefine((value, context) => {
  if (new Set(value.documents.map((doc) => doc.id)).size !== value.documents.length) context.addIssue({ code: "custom", message: "Document IDs must be unique." });
  if (value.selectedId !== null && !value.documents.some((doc) => doc.id === value.selectedId)) context.addIssue({ code: "custom", message: "The selected document is missing." });
});
export type Document = z.infer<typeof documentSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Library = z.infer<typeof librarySchema>;
export type Intent = { kind: "select"; id: string } | { kind: "new" } | { kind: "delete" } | { kind: "reload" };

export function selectedDocument(library: Library): Document | null {
  return library.documents.find((doc) => doc.id === library.selectedId) ?? null;
}
export function hasUnsavedChanges(saved: Document | undefined, draft: Draft): boolean {
  return !saved || saved.name !== draft.name || saved.content !== draft.content;
}
export function saveDocument(library: Library, id: string, input: Draft, now: number): Library {
  const existing = library.documents.find((doc) => doc.id === id);
  const document = documentSchema.parse({ ...draftSchema.parse(input), id, createdAt: existing?.createdAt ?? now, updatedAt: now });
  const exists = existing !== undefined;
  return librarySchema.parse({ ...library, selectedId: id, documents: exists
    ? library.documents.map((doc) => doc.id === id ? document : doc)
    : [...library.documents, document] });
}
export function deleteDocument(library: Library, id: string): Library {
  const documents = library.documents.filter((doc) => doc.id !== id);
  return { ...library, documents, selectedId: library.selectedId === id ? (documents[0]?.id ?? null) : library.selectedId };
}
// A new document joins the library at once (as in the design's list) under a fresh UUID; IDs are never reused.
export function addDocument(library: Library, id: string, now: number): Library {
  if (library.documents.some((doc) => doc.id === id)) throw new Error("Document IDs must be unique.");
  const document = documentSchema.parse({ id, name: "untitled-document.md", content: "", createdAt: now, updatedAt: now });
  return librarySchema.parse({ ...library, selectedId: id, documents: [...library.documents, document] });
}
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" });
// "01 April 2022", the design's spelled-out form, so no reader has to guess day/month order.
export function documentDate(doc: Document): string {
  return dateFormat.format(new Date(doc.createdAt ?? doc.updatedAt));
}
