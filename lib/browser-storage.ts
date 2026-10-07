import { librarySchema, MAX_STORAGE_BYTES, type Library } from "./documents.ts";

export const STORAGE_KEY = "markdown-editor-library-v1";
const LOCK_NAME = "markdown-editor-library-write";
export type Snapshot = { library: Library; raw: string | null };
export type ReadResult = { kind: "loaded"; snapshot: Snapshot } | { kind: "invalid"; raw: string; message: string } | { kind: "unavailable"; message: string };
export type WriteResult = { kind: "saved"; snapshot: Snapshot } | { kind: "conflict"; message: string } | { kind: "failed"; message: string };
export type StoragePort = Pick<Storage, "getItem" | "setItem">;
export type Exclusive = <T>(work: () => T) => Promise<T>;
const byteSize = (text: string) => new TextEncoder().encode(text).length;

export function readLibrary(storage: StoragePort, fallback: Library): ReadResult {
  let raw: string | null;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { kind: "unavailable", message: "Browser storage is unavailable. Your current edits stay in this tab; download a copy before leaving." }; }
  if (raw === null) return { kind: "loaded", snapshot: { library: fallback, raw } };
  try {
    if (byteSize(raw) > MAX_STORAGE_BYTES) throw new Error("size");
    const data: unknown = JSON.parse(raw);
    return { kind: "loaded", snapshot: { library: librarySchema.parse(data), raw } };
  } catch { return { kind: "invalid", raw, message: "The saved library could not be read. It has not been replaced. Download its backup before choosing to reset it." }; }
}

export async function writeLibrary(storage: StoragePort, exclusive: Exclusive | null, expectedRaw: string | null, next: Library, revision: string): Promise<WriteResult> {
  if (!exclusive) return { kind: "failed", message: "Safe cross-tab saving is unavailable in this browser. Editing and downloading still work." };
  try {
    const library = librarySchema.parse({ ...next, revision });
    const raw = JSON.stringify(library);
    if (byteSize(raw) > MAX_STORAGE_BYTES) return { kind: "failed", message: "This library exceeds the 2 MB limit. Download your edits and remove saved documents before trying again." };
    return await exclusive((): WriteResult => {
      // The comparison and write share one origin-wide lock, including selection/theme updates.
      if (storage.getItem(STORAGE_KEY) !== expectedRaw) return { kind: "conflict", message: "Another tab changed this library. Your edits are intact. Download them or reload saved documents before continuing." };
      storage.setItem(STORAGE_KEY, raw);
      return { kind: "saved", snapshot: { library, raw } };
    });
  } catch { return { kind: "failed", message: "Saving failed or storage is full. Existing saved documents and your edits are unchanged. Download your edits or try again." }; }
}
export function browserExclusive(): Exclusive | null {
  if (typeof navigator === "undefined" || !navigator.locks) return null;
  return (work) => navigator.locks.request(LOCK_NAME, work);
}
