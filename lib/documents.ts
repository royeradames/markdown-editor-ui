import { z } from "zod";

export const MAX_DOCUMENTS = 100;
export const MAX_CONTENT = 200_000;
export const MAX_STORAGE_BYTES = 2_000_000;
export const draftSchema = z.object({
  name: z.string().trim().min(1, "Give the document a name.").max(80, "Use at most 80 characters."),
  content: z.string().max(MAX_CONTENT, "A document can contain at most 200,000 characters."),
});
export const documentSchema = draftSchema.extend({ id: z.uuid(), updatedAt: z.number().int().nonnegative() });
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
// A record stays a source example until the user saves it (saveDocument stamps updatedAt).
// Library-level writes such as the theme or the selected document never change that.
export function isSourceExample(doc: Document): boolean {
  return doc.updatedAt === 0;
}
export function hasUnsavedChanges(saved: Document | undefined, draft: Draft): boolean {
  return !saved || saved.name !== draft.name || saved.content !== draft.content;
}
export function saveDocument(library: Library, id: string, input: Draft, now: number): Library {
  const document = documentSchema.parse({ ...draftSchema.parse(input), id, updatedAt: now });
  const exists = library.documents.some((doc) => doc.id === id);
  return librarySchema.parse({ ...library, selectedId: id, documents: exists
    ? library.documents.map((doc) => doc.id === id ? document : doc)
    : [...library.documents, document] });
}
export function deleteDocument(library: Library, id: string): Library {
  const documents = library.documents.filter((doc) => doc.id !== id);
  return { ...library, documents, selectedId: library.selectedId === id ? (documents[0]?.id ?? null) : library.selectedId };
}
export function newDocument(id: string): Document {
  return documentSchema.parse({ id, name: "untitled-document.md", content: "", updatedAt: 0 });
}
