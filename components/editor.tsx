"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm } from "@tanstack/react-form";
import { deleteDocument, draftSchema, hasUnsavedChanges, MAX_CONTENT, MAX_DOCUMENTS, newDocument, saveDocument, selectedDocument, type Document, type Draft, type Intent, type Library } from "../lib/documents.ts";
import { browserExclusive, readLibrary, STORAGE_KEY, writeLibrary, type ReadResult, type Snapshot } from "../lib/browser-storage.ts";
import { exampleLibrary } from "../lib/examples.ts";
import { MarkdownPreview } from "./markdown-preview";

type Issue = { kind: "invalid"; raw: string; message: string } | { kind: "notice"; message: string } | null;
type Prompt = { kind: "unsaved"; intent: Intent } | { kind: "delete"; name: string } | { kind: "reset" } | null;
const initialSnapshot: Snapshot = { library: exampleLibrary, raw: null };
const initialDocument = selectedDocument(exampleLibrary);

function fromRead(result: ReadResult): { snapshot: Snapshot; issue: Issue } {
  if (result.kind === "loaded") return { snapshot: result.snapshot, issue: null };
  return { snapshot: initialSnapshot, issue: result.kind === "invalid" ? result : { kind: "notice", message: result.message } };
}

function download(text: string, filename: string, type = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[^a-zA-Z0-9_. -]/g, "_").slice(0, 80) || "document.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function Editor() {
  const [loaded, setLoaded] = useState<{ snapshot: Snapshot; issue: Issue } | null>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try { setLoaded(fromRead(readLibrary(window.localStorage, exampleLibrary))); }
      catch { setLoaded({ snapshot: initialSnapshot, issue: { kind: "notice", message: "Browser storage is unavailable. You can edit and download documents, but saving may fail." } }); }
    });
    return () => { active = false; };
  }, []);
  return loaded ? <LibraryWorkspace initial={loaded.snapshot} initialIssue={loaded.issue} /> : <Workspace initial={initialSnapshot} document={initialDocument} ready={false} onOpen={() => {}} onSaved={() => {}} issueAtOpen={null} />;
}

function LibraryWorkspace({ initial, initialIssue }: { initial: Snapshot; initialIssue: Issue }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [opened, setOpened] = useState(() => ({ document: selectedDocument(initial.library), generation: 0, issue: initialIssue }));
  return <Workspace key={opened.generation} initial={snapshot} document={opened.document} ready onSaved={(next) => { setSnapshot(next); setOpened((current) => ({ ...current, issue: null })); }} issueAtOpen={opened.issue} focusOnOpen={opened.generation > 0} onOpen={(document, next, issue) => {
    setSnapshot(next);
    setOpened((current) => ({ document, generation: current.generation + 1, issue }));
  }} />;
}

function NativeDialog({ children, title, error, onCancel }: { children: ReactNode; title: string; error: string; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="dialog-title">{title}</h2>
    {error && <p ref={errorRef} role="alert" tabIndex={-1} className="notice">{error}</p>}
    {children}
  </dialog>;
}

function Workspace({ initial, document: opened, ready, onOpen, onSaved, issueAtOpen, focusOnOpen = false }: {
  initial: Snapshot; document: Document | null; ready: boolean; issueAtOpen: Issue; focusOnOpen?: boolean;
  onOpen: (document: Document | null, snapshot: Snapshot, issue: Issue) => void;
  onSaved: (snapshot: Snapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const snapshotRef = useRef(initial);
  const [issue, setIssue] = useState<Issue>(issueAtOpen);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [dialogError, setDialogError] = useState("");
  const [defaultValues] = useState<Draft>(() => ({ name: opened?.name ?? "", content: opened?.content ?? "" }));
  const form = useForm({ defaultValues, validators: { onSubmit: draftSchema } });
  const nameRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusOnOpen) (nameRef.current?.disabled ? newRef.current : nameRef.current)?.focus();
  }, [focusOnOpen]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setIssue({ kind: "notice", message: "Another tab changed the saved library. Your edits are intact. Download them or reload saved documents before continuing." });
      }
    };
    const warn = (event: BeforeUnloadEvent) => {
      const saved = snapshotRef.current.library.documents.find((doc) => doc.id === opened?.id);
      if (opened && hasUnsavedChanges(saved, form.state.values)) { event.preventDefault(); }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("storage", handleStorage); window.removeEventListener("beforeunload", warn); };
  }, [form, opened]);

  function reportFailure(message: string) {
    setMessage(message);
    if (prompt) setDialogError(message);
  }

  async function persist(library: Library, expectedRaw = snapshotRef.current.raw): Promise<Snapshot | null> {
    if (busyRef.current) return null;
    if (issue?.kind === "invalid" && expectedRaw !== issue.raw) { reportFailure("Download the storage backup, then reset or reload the unreadable library before saving."); return null; }
    busyRef.current = true; setBusy(true); setMessage(""); setDialogError("");
    try {
      const result = await writeLibrary(window.localStorage, browserExclusive(), expectedRaw, library, crypto.randomUUID());
      if (result.kind !== "saved") { setIssue({ kind: "notice", message: result.message }); if (prompt) setDialogError(result.message); return null; }
      snapshotRef.current = result.snapshot;
      setSnapshot(result.snapshot); onSaved(result.snapshot); setIssue(null);
      return result.snapshot;
    } catch {
      const message = "Storage is unavailable. Your edits are still here; download them before leaving.";
      setIssue({ kind: "notice", message }); if (prompt) setDialogError(message); return null;
    }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function save(): Promise<Snapshot | null> {
    if (!opened) return null;
    const parsed = draftSchema.safeParse(form.state.values);
    if (!parsed.success) {
      reportFailure(parsed.error.issues[0]?.message ?? "Check the document.");
      if (!prompt) nameRef.current?.focus();
      return null;
    }
    try {
      const next = saveDocument(snapshotRef.current.library, opened.id, parsed.data, Date.now());
      const saved = await persist(next);
      if (saved) { form.reset(parsed.data, { keepDefaultValues: true }); setMessage("Saved in this browser."); }
      return saved;
    } catch { reportFailure(`Save failed. A library can hold ${MAX_DOCUMENTS} documents with at most ${MAX_CONTENT.toLocaleString()} characters each.`); return null; }
  }

  async function execute(intent: Intent, current = snapshotRef.current) {
    if (intent.kind === "delete") { setPrompt({ kind: "delete", name: current.library.documents.find((doc) => doc.id === opened?.id)?.name ?? (form.state.values.name || "untitled document") }); return; }
    if (intent.kind === "reload") {
      try {
        const result = readLibrary(window.localStorage, exampleLibrary);
        if (result.kind !== "loaded") { setIssue(result.kind === "invalid" ? result : { kind: "notice", message: result.message }); return; }
        onOpen(selectedDocument(result.snapshot.library), result.snapshot, null);
      } catch { setIssue({ kind: "notice", message: "Storage is still unavailable. Your draft has not been discarded." }); }
      return;
    }
    if (intent.kind === "new") {
      if (current.library.documents.length >= MAX_DOCUMENTS) { setMessage(`The library is full (${MAX_DOCUMENTS} documents). Delete a saved document first.`); return; }
      onOpen(newDocument(crypto.randomUUID()), current, issue); return;
    }
    const nextDocument = current.library.documents.find((doc) => doc.id === intent.id);
    if (!nextDocument) { setMessage("That document is no longer available. Reload saved documents."); return; }
    const next = await persist({ ...current.library, selectedId: nextDocument.id });
    if (next) onOpen(nextDocument, next, null);
  }

  function request(intent: Intent) {
    if (busyRef.current || !ready) return;
    setDialogError("");
    if (intent.kind === "select" && intent.id === opened?.id) return;
    const saved = snapshotRef.current.library.documents.find((doc) => doc.id === opened?.id);
    if (opened && hasUnsavedChanges(saved, form.state.values)) { setPrompt({ kind: "unsaved", intent }); return; }
    void execute(intent);
  }

  async function continueUnsaved(action: "save" | "discard") {
    if (prompt?.kind !== "unsaved") return;
    const intent = prompt.intent;
    const current = action === "save" ? await save() : snapshotRef.current;
    if (!current) return;
    if (action === "discard" && intent.kind === "delete") {
      const saved = current.library.documents.find((doc) => doc.id === opened?.id);
      form.reset(saved ? { name: saved.name, content: saved.content } : defaultValues, { keepDefaultValues: true });
    }
    setPrompt(null);
    // A failed storage operation leaves this working copy mounted and intact.
    await execute(intent, current);
  }

  async function confirmDelete() {
    if (!opened) return;
    const current = snapshotRef.current;
    if (!current.library.documents.some((doc) => doc.id === opened.id)) {
      setPrompt(null); onOpen(selectedDocument(current.library), current, issue); return;
    }
    const next = await persist(deleteDocument(current.library, opened.id));
    if (next) { setPrompt(null); onOpen(selectedDocument(next.library), next, null); }
  }

  async function resetInvalid() {
    if (issue?.kind !== "invalid") return;
    const next = await persist(exampleLibrary, issue.raw);
    if (next) { setPrompt(null); onOpen(selectedDocument(next.library), next, null); }
  }

  const visibleDocuments = snapshot.library.documents.filter((doc) => doc.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <form.Subscribe selector={(state) => state.values}>{(values) => {
    const saved = snapshot.library.documents.find((doc) => doc.id === opened?.id);
    const dirty = opened ? hasUnsavedChanges(saved, values) : false;
    return <div className="editor-app" data-theme={snapshot.library.theme}>
      <a className="skip-link" href="#markdown-input">Skip to Markdown</a>
      <header className="topbar">
        <button className="menu-button" type="button" aria-expanded={drawer} aria-controls="documents-panel" onClick={() => setDrawer(!drawer)}>Documents</button>
        <h1>MARKDOWN</h1><span className="local-label">Saved on this browser only</span>
        <div className="document-actions"><button disabled={!ready || busy || !opened} onClick={() => request({ kind: "delete" })}>Delete</button><button className="primary" disabled={!ready || busy || !opened} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</button></div>
      </header>
      <div className="workspace-layout">
        <aside id="documents-panel" className={drawer ? "documents-panel open" : "documents-panel"} aria-label="Documents">
          <h2>My documents</h2><p>Edits stay unsaved until you choose Save. Clearing browser data removes saved documents.</p>
          <button ref={newRef} className="primary" disabled={!ready || busy} onClick={() => request({ kind: "new" })}>+ New document</button>
          <label htmlFor="document-search">Search documents</label><input id="document-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSearch(""); }} />
          <nav aria-label="Saved documents"><ul>{visibleDocuments.map((doc) => <li key={doc.id}><button disabled={!ready || busy} aria-current={doc.id === opened?.id ? "page" : undefined} onClick={() => request({ kind: "select", id: doc.id })}><span>{doc.name}</span><small>{doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : "Source example"}</small></button></li>)}</ul></nav>
          {!visibleDocuments.length && <p>{search ? "No documents match this search. Your selected document stays open." : "No saved documents yet."}</p>}
          {opened && !saved && <p>New document: {values.name || "Untitled"} (unsaved)</p>}
          <button disabled={!ready || busy} onClick={() => void persist({ ...snapshotRef.current.library, theme: snapshot.library.theme === "light" ? "dark" : "light" })}>Use {snapshot.library.theme === "light" ? "dark" : "light"} theme</button>
          <button disabled={!ready || busy} onClick={() => request({ kind: "reload" })}>Reload saved documents</button>
        </aside>
        <main className="editor-main">
          <div className="document-heading">
            <form.Field name="name">{(field) => <label>Document name<input ref={nameRef} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} maxLength={80} disabled={!ready || busy || !opened} /></label>}</form.Field>
            <p role="status">{!ready ? "Opening local documents…" : dirty ? "Unsaved changes" : opened ? snapshot.raw === null ? "Source example — not yet saved" : "Saved version" : "No document selected"}</p>
            <button disabled={!opened} onClick={() => download(values.content, values.name)}>Download draft</button>
          </div>
          {issue && <section className="notice" role="alert"><p>{issue.message}</p>{issue.kind === "invalid" && <div className="button-row"><button onClick={() => download(issue.raw, "markdown-library-backup.json", "application/json")}>Download storage backup</button><button disabled={busy} onClick={() => { setDialogError(""); setPrompt({ kind: "reset" }); }}>Reset saved library</button></div>}</section>}
          {message && <p role="status" className="notice">{message}</p>}
          {opened ? <>
            <div className="view-controls"><div className="mobile-modes" role="group" aria-label="Editor view"><button aria-pressed={mode === "edit"} onClick={() => { setMode("edit"); setExpanded(false); }}>Editor</button><button aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Preview</button></div><button aria-pressed={expanded} onClick={() => { setExpanded(!expanded); setMode("preview"); }}>{expanded ? "Exit expanded preview" : "Expand preview"}</button></div>
            <div className="panes" data-mode={mode} data-expanded={expanded}>
              <section className="edit-pane" aria-label="Markdown editor"><h2>Markdown</h2><form.Field name="content">{(field) => <textarea id="markdown-input" aria-label="Markdown content" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} maxLength={MAX_CONTENT} spellCheck={false} disabled={!ready || busy} />}</form.Field><p className="character-count">{values.content.length.toLocaleString()} / {MAX_CONTENT.toLocaleString()} characters</p></section>
              <section className="preview-pane" aria-label="Markdown preview"><h2>Preview</h2><MarkdownPreview content={values.content} /></section>
            </div>
          </> : <div className="empty-state"><h2>Your library is empty.</h2><p>Create a document to start writing. Saved documents stay in this browser.</p><button className="primary" onClick={() => request({ kind: "new" })}>Create a document</button></div>}
        </main>
      </div>
      {prompt?.kind === "unsaved" && <NativeDialog error={dialogError} key={prompt.kind} title="Save your changes?" onCancel={() => { if (!busy) setPrompt(null); }}><p>Your edits to “{values.name || "untitled document"}” have not been saved.</p><div className="button-row"><button autoFocus disabled={busy} onClick={() => setPrompt(null)}>Cancel</button><button disabled={busy} onClick={() => void continueUnsaved("discard")}>Discard changes</button><button className="primary" disabled={busy} onClick={() => void continueUnsaved("save")}>Save and continue</button></div></NativeDialog>}
      {prompt?.kind === "delete" && <NativeDialog error={dialogError} key={prompt.kind} title={`Delete “${prompt.name}”?`} onCancel={() => { if (!busy) setPrompt(null); }}><p>This removes only this document from this browser. Download a copy first if you want to keep it.</p><div className="button-row"><button autoFocus disabled={busy} onClick={() => setPrompt(null)}>Cancel</button><button className="danger" disabled={busy} onClick={() => void confirmDelete()}>Delete document</button></div></NativeDialog>}
      {prompt?.kind === "reset" && <NativeDialog error={dialogError} key={prompt.kind} title="Reset unreadable saved documents?" onCancel={() => { if (!busy) setPrompt(null); }}><p>This replaces the unreadable library with the two source examples. Download the storage backup and your current draft first. Other tabs’ newer changes will never be overwritten.</p><div className="button-row"><button autoFocus disabled={busy} onClick={() => setPrompt(null)}>Cancel</button><button className="danger" disabled={busy} onClick={() => void resetInvalid()}>Reset library</button></div></NativeDialog>}
    </div>;
  }}</form.Subscribe>;
}
