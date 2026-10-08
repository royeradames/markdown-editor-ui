"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useForm } from "@tanstack/react-form";
import { addDocument, deleteDocument, documentDate, draftSchema, hasUnsavedChanges, MAX_CONTENT, MAX_DOCUMENTS, saveDocument, selectedDocument, type Document, type Draft, type Intent, type Library } from "../lib/documents.ts";
import { browserExclusive, readLibrary, STORAGE_KEY, writeLibrary, type ReadResult, type Snapshot } from "../lib/browser-storage.ts";
import { exampleLibrary } from "../lib/examples.ts";
import { MarkdownPreview } from "./markdown-preview";
import { CheckIcon, CloseIcon, DeleteIcon, DocumentIcon, HidePreviewIcon, LogoIcon, MenuIcon, MoonIcon, SaveIcon, ShowPreviewIcon, SunIcon } from "./icons";

type Issue = { kind: "invalid"; raw: string; message: string } | { kind: "notice"; message: string } | null;
type Prompt = { kind: "unsaved"; intent: Intent } | { kind: "delete"; name: string } | { kind: "reset" } | null;
type Theme = Library["theme"];
const initialSnapshot: Snapshot = { library: exampleLibrary, raw: null };
const initialDocument = selectedDocument(exampleLibrary);
const SLOW_SAVE_MS = 3000;
const SAVED_LABEL_MS = 2000;

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function fromRead(result: ReadResult): { snapshot: Snapshot; issue: Issue } {
  if (result.kind === "loaded") {
    // Nothing saved yet: start from the starter documents in the reader's system theme.
    const snapshot = result.snapshot.raw === null ? { ...result.snapshot, library: { ...result.snapshot.library, theme: systemTheme() } } : result.snapshot;
    return { snapshot, issue: null };
  }
  return { snapshot: { ...initialSnapshot, library: { ...exampleLibrary, theme: systemTheme() } }, issue: result.kind === "invalid" ? result : { kind: "notice", message: result.message } };
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
  return loaded
    ? <LibraryWorkspace initial={loaded.snapshot} initialIssue={loaded.issue} />
    : <Workspace initial={initialSnapshot} document={initialDocument} ready={false} onOpen={() => {}} onSaved={() => {}} issueAtOpen={null} />;
}

function LibraryWorkspace({ initial, initialIssue }: { initial: Snapshot; initialIssue: Issue }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [opened, setOpened] = useState(() => ({ document: selectedDocument(initial.library), generation: 0, issue: initialIssue }));
  return <Workspace
    key={opened.generation}
    initial={snapshot}
    document={opened.document}
    ready
    issueAtOpen={opened.issue}
    focusOnOpen={opened.generation > 0}
    onSaved={(next) => { setSnapshot(next); setOpened((current) => ({ ...current, issue: null })); }}
    onOpen={(document, next, issue) => {
      setSnapshot(next);
      setOpened((current) => ({ document, generation: current.generation + 1, issue }));
    }}
  />;
}

function NativeDialog({ children, title, description, error, onCancel, onClosed }: { children: ReactNode; title: string; description: ReactNode; error: string; onCancel: () => void; onClosed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    // showModal focuses the first control; start on the safe choice instead (React does not render autofocus to the DOM).
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  // The dialog box has no padding of its own, so a click whose target is the <dialog> itself landed on the backdrop.
  // A modal <dialog> lets Tab leave the page for the browser chrome; keep it cycling through the dialog's own controls.
  function trapTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, [href], input, textarea, [tabindex]:not([tabindex='-1'])")];
    const first = controls[0]; const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <dialog ref={ref} aria-labelledby="dialog-title" aria-describedby="dialog-description" onKeyDown={trapTab} onCancel={(event) => { event.preventDefault(); onCancel(); }} onClose={onClosed} onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="dialog-body">
      <h2 id="dialog-title">{title}</h2>
      <p id="dialog-description">{description}</p>
      {error && <p ref={errorRef} role="alert" tabIndex={-1} className="dialog-error">{error}</p>}
      <div className="dialog-actions">{children}</div>
    </div>
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
  const [announcement, setAnnouncement] = useState("");
  const [drawer, setDrawer] = useState(false);
  // One eye toggle: wide screens hide the Markdown pane; phones swap their single visible pane.
  const [previewOnly, setPreviewOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const busyRef = useRef(false);
  const timers = useRef<{ slow?: number; saved?: number }>({});
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [dialogError, setDialogError] = useState("");
  const [defaultValues] = useState<Draft>(() => ({ name: opened?.name ?? "", content: opened?.content ?? "" }));
  const form = useForm({ defaultValues, validators: { onSubmit: draftSchema } });
  const nameRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const toggleRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const theme = snapshot.library.theme;

  useEffect(() => {
    if (focusOnOpen) (nameRef.current ?? createRef.current)?.focus();
  }, [focusOnOpen]);

  // The inline script in the layout paints the saved theme before hydration; keep <html> in step once storage is read.
  useEffect(() => {
    if (ready) document.documentElement.dataset.theme = theme;
  }, [ready, theme]);

  useEffect(() => {
    const pending = timers.current;
    return () => { window.clearTimeout(pending.slow); window.clearTimeout(pending.saved); };
  }, []);

  // Escape closes the Documents drawer from anywhere outside a dialog; focus that was inside the drawer returns to its button.
  useEffect(() => {
    if (!drawer) return;
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      const active = document.activeElement;
      const wasInside = active === menuRef.current || (active instanceof Node && !!panelRef.current?.contains(active)) || active === document.body;
      setDrawer(false);
      if (wasInside) menuRef.current?.focus();
    };
    // Focus that leaves the drawer for the (partly off-screen) app closes it, so the focused control is always on screen.
    // Dialogs opened from the drawer are exempt: closing one returns focus to its opener inside the drawer.
    const follow = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target === menuRef.current || panelRef.current?.contains(target) || target.closest("dialog")) return;
      setDrawer(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("focusin", follow);
    return () => { window.removeEventListener("keydown", close); window.removeEventListener("focusin", follow); };
  }, [drawer]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setIssue({ kind: "notice", message: "Another tab changed the saved documents. Your edits here are intact. Download them or reload the saved documents before continuing." });
      }
    };
    const warn = (event: BeforeUnloadEvent) => {
      const saved = snapshotRef.current.library.documents.find((doc) => doc.id === opened?.id);
      if (opened && hasUnsavedChanges(saved, form.state.values)) event.preventDefault();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("storage", handleStorage); window.removeEventListener("beforeunload", warn); };
  }, [form, opened]);

  function reportFailure(text: string) {
    setMessage(text);
    if (prompt) setDialogError(text);
  }

  async function persist(library: Library, expectedRaw = snapshotRef.current.raw): Promise<Snapshot | null> {
    if (busyRef.current) return null;
    if (issue?.kind === "invalid" && expectedRaw !== issue.raw) { reportFailure("Download the storage backup, then reset or reload the unreadable saved documents before saving."); return null; }
    busyRef.current = true; setBusy(true); setSlow(false); setMessage(""); setDialogError("");
    window.clearTimeout(timers.current.slow);
    timers.current.slow = window.setTimeout(() => setSlow(true), SLOW_SAVE_MS);
    try {
      const result = await writeLibrary(window.localStorage, browserExclusive(), expectedRaw, library, crypto.randomUUID());
      if (result.kind !== "saved") { setIssue({ kind: "notice", message: result.message }); if (prompt) setDialogError(result.message); return null; }
      snapshotRef.current = result.snapshot;
      setSnapshot(result.snapshot); onSaved(result.snapshot); setIssue(null);
      return result.snapshot;
    } catch {
      const text = "Storage is unavailable. Your edits are still here; download them before leaving.";
      setIssue({ kind: "notice", message: text }); if (prompt) setDialogError(text); return null;
    } finally {
      window.clearTimeout(timers.current.slow);
      busyRef.current = false; setBusy(false); setSlow(false);
    }
  }

  async function save(): Promise<Snapshot | null> {
    if (!ready || !opened) return null;
    if (busyRef.current) { stillSaving(); return null; }
    const submitted = form.state.values;
    const parsed = draftSchema.safeParse(submitted);
    if (!parsed.success) {
      reportFailure(parsed.error.issues[0]?.message ?? "Check the document.");
      if (!prompt) nameRef.current?.focus();
      return null;
    }
    setAnnouncement("Saving…");
    try {
      const next = saveDocument(snapshotRef.current.library, opened.id, parsed.data, Date.now());
      const saved = await persist(next);
      if (saved) {
        // Controls stay editable while saving; only adopt the normalized values if nothing was typed meanwhile.
        const now = form.state.values;
        if (now.name === submitted.name && now.content === submitted.content) form.reset(parsed.data, { keepDefaultValues: true });
        setAnnouncement(`Saved ${parsed.data.name} in this browser.`);
        setJustSaved(true);
        window.clearTimeout(timers.current.saved);
        timers.current.saved = window.setTimeout(() => setJustSaved(false), SAVED_LABEL_MS);
      } else setAnnouncement("");
      return saved;
    } catch {
      setAnnouncement("");
      reportFailure(`Save failed. The library holds at most ${MAX_DOCUMENTS} documents of up to ${MAX_CONTENT.toLocaleString("en-US")} characters each.`);
      return null;
    }
  }

  async function execute(intent: Intent, current = snapshotRef.current) {
    if (intent.kind === "delete") {
      setPrompt({ kind: "delete", name: current.library.documents.find((doc) => doc.id === opened?.id)?.name ?? (form.state.values.name || "untitled-document.md") });
      return;
    }
    if (intent.kind === "reload") {
      try {
        const result = readLibrary(window.localStorage, exampleLibrary);
        if (result.kind !== "loaded") { setIssue(result.kind === "invalid" ? result : { kind: "notice", message: result.message }); return; }
        onOpen(selectedDocument(result.snapshot.library), result.snapshot, null);
      } catch { setIssue({ kind: "notice", message: "Storage is still unavailable. Your draft has not been discarded." }); }
      return;
    }
    if (intent.kind === "new") {
      if (current.library.documents.length >= MAX_DOCUMENTS) { setMessage(`You have ${MAX_DOCUMENTS} documents, the most this browser library holds. Delete one first.`); return; }
      const next = await persist(addDocument(current.library, crypto.randomUUID(), Date.now()));
      if (next) onOpen(selectedDocument(next.library), next, null);
      return;
    }
    const nextDocument = current.library.documents.find((doc) => doc.id === intent.id);
    if (!nextDocument) { setMessage("That document is no longer available. Reload the saved documents."); return; }
    const next = await persist({ ...current.library, selectedId: nextDocument.id });
    if (next) onOpen(nextDocument, next, null);
  }

  function request(intent: Intent) {
    if (!ready) return;
    if (busyRef.current) { stillSaving(); return; }
    setDialogError("");
    if (intent.kind === "select" && intent.id === opened?.id) { setDrawer(false); nameRef.current?.focus(); return; }
    const saved = snapshotRef.current.library.documents.find((doc) => doc.id === opened?.id);
    if (opened && hasUnsavedChanges(saved, form.state.values) && intent.kind !== "delete") { setPrompt({ kind: "unsaved", intent }); return; }
    void execute(intent);
  }

  async function continueUnsaved(action: "save" | "discard") {
    if (prompt?.kind !== "unsaved" || busyRef.current) return;
    const intent = prompt.intent;
    const current = action === "save" ? await save() : snapshotRef.current;
    if (!current) return;
    setPrompt(null);
    // A failed storage operation leaves this working copy mounted and intact.
    await execute(intent, current);
  }

  async function confirmDelete() {
    if (!opened || busyRef.current) return;
    const current = snapshotRef.current;
    if (!current.library.documents.some((doc) => doc.id === opened.id)) {
      setPrompt(null); onOpen(selectedDocument(current.library), current, issue); return;
    }
    const next = await persist(deleteDocument(current.library, opened.id));
    if (next) { setPrompt(null); onOpen(selectedDocument(next.library), next, null); }
  }

  async function resetInvalid() {
    if (issue?.kind !== "invalid" || busyRef.current) return;
    // Fresh IDs: a reset must not bring back an ID that a deleted document once had.
    const documents = exampleLibrary.documents.map((doc) => ({ ...doc, id: crypto.randomUUID() }));
    const next = await persist({ ...exampleLibrary, documents, selectedId: documents[1]?.id ?? null }, issue.raw);
    if (next) { setPrompt(null); onOpen(selectedDocument(next.library), next, null); }
  }

  function cancelPrompt() { if (!busyRef.current) setPrompt(null); }
  // Chrome closes a modal itself on a repeated Escape even when cancel is refused; keep React's state in step so it can reopen.
  function dialogClosed() { setPrompt(null); }
  function stillSaving() { setAnnouncement("Still saving. Try again in a moment."); }

  function toggleTheme() {
    if (!ready) return;
    if (busyRef.current) { stillSaving(); return; }
    void persist({ ...snapshotRef.current.library, theme: theme === "light" ? "dark" : "light" });
  }

  function togglePreview() {
    setPreviewOnly((current) => !current);
    // On phones the pressed toggle's pane disappears; move focus to the toggle that is now on screen.
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.offsetParent !== null) return;
      toggleRefs.current.find((button) => button && button.offsetParent !== null)?.focus();
    });
  }

  const documents = snapshot.library.documents;
  return <form.Subscribe selector={(state) => state.values}>{(values) => {
    const previewToggle = (index: number) => <button
      ref={(node) => { toggleRefs.current[index] = node; }}
      type="button"
      className="icon-button preview-toggle"
      aria-label="Preview only"
      aria-pressed={previewOnly}
      onClick={togglePreview}
    >{previewOnly ? <HidePreviewIcon /> : <ShowPreviewIcon />}</button>;
    const saveLabel = busy ? "Saving…" : "Save Changes";
    return <div className="editor-app" data-ready={ready} data-sidebar={drawer ? "open" : "closed"}>
      <a className="skip-link" href={opened && !previewOnly ? "#markdown-input" : "#main"}>Skip to editor</a>
      <div className="app-frame">
        <button ref={menuRef} className="menu-button" type="button" aria-label="Documents" aria-expanded={drawer} aria-controls="documents-panel" onClick={() => setDrawer(!drawer)}>
          {drawer ? <CloseIcon /> : <MenuIcon />}
        </button>
        <aside ref={panelRef} id="documents-panel" className="sidebar" aria-labelledby="documents-heading" inert={!drawer}>
          <h2 id="documents-heading">My documents</h2>
          <button type="button" className="button-primary new-document" onClick={() => request({ kind: "new" })}>+ New Document</button>
          <ul className="document-list">
            {ready && documents.map((doc) => <li key={doc.id}>
              <button type="button" className="document-link" aria-current={doc.id === opened?.id ? "page" : undefined} onClick={() => request({ kind: "select", id: doc.id })}>
                <DocumentIcon />
                <span className="document-meta"><span className="document-title">{doc.name}</span><span className="document-date">{documentDate(doc)}</span></span>
              </button>
            </li>)}
          </ul>
          {!documents.length && <p className="sidebar-empty">No documents yet.</p>}
          <div className="theme-toggle" data-theme-active={theme}>
            <MoonIcon />
            <button type="button" role="switch" className="switch" aria-checked={theme === "dark"} aria-label="Dark mode" onClick={toggleTheme}><span className="switch-knob" /></button>
            <SunIcon />
          </div>
        </aside>
        <header className="topbar">
          <h1 className="logo"><LogoIcon /><span className="sr-only">Markdown</span></h1>
          {opened && <div className="document-info">
            <DocumentIcon />
            <form.Field name="name">{(field) => <div className="document-name-field">
              <label htmlFor="document-name">Document Name</label>
              <input id="document-name" ref={nameRef} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} maxLength={80} spellCheck={false} autoComplete="off" />
            </div>}</form.Field>
          </div>}
          {opened && <div className="document-actions">
            <button type="button" className="icon-button delete-button" aria-label="Delete document" onClick={() => request({ kind: "delete" })}><DeleteIcon /></button>
            <button type="button" className="button-primary save-button" aria-busy={busy} data-state={busy ? "saving" : justSaved ? "saved" : "idle"} onClick={() => void save()}>
              {busy ? <span className="spinner" aria-hidden="true" /> : justSaved ? <CheckIcon /> : <SaveIcon />}<span className="save-label">{saveLabel}</span>
            </button>
          </div>}
        </header>
        <main id="main" className="editor-main" tabIndex={-1}>
          {issue && <section className="notice" role="alert">
            <p>{issue.message}</p>
            <div className="notice-actions">
              {issue.kind === "invalid" ? <>
                <button type="button" onClick={() => download(issue.raw, "markdown-library-backup.json", "application/json")}>Download storage backup</button>
                <button type="button" onClick={() => { if (busyRef.current) return; setDialogError(""); setPrompt({ kind: "reset" }); }}>Reset saved documents</button>
              </> : <>
                {opened && <button type="button" onClick={() => download(values.content, values.name)}>Download this draft</button>}
                <button type="button" onClick={() => request({ kind: "reload" })}>Reload saved documents</button>
              </>}
            </div>
          </section>}
          {message && <p role="alert" className="notice">{message}</p>}
          {slow && <p role="status" className="notice">Still saving. Another tab may be saving these documents; this finishes when it does.</p>}
          {opened ? <div className="panes" data-preview-only={previewOnly}>
            <section className="edit-pane" aria-label="Markdown editor">
              <div className="pane-header"><h2>Markdown</h2>{previewToggle(0)}</div>
              <form.Field name="content">{(field) => <textarea id="markdown-input" aria-label="Markdown content" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} maxLength={MAX_CONTENT} spellCheck={false} />}</form.Field>
            </section>
            <section className="preview-pane" aria-label="Markdown preview">
              <div className="pane-header"><h2>Preview</h2>{previewToggle(1)}</div>
              <div className="preview-scroll"><MarkdownPreview content={values.content} /></div>
            </section>
          </div> : <div className="empty-state">
            <h2>No documents yet</h2>
            <p>Create a document to start writing. Documents are saved in this browser only.</p>
            <button ref={createRef} type="button" className="button-primary" onClick={() => request({ kind: "new" })}>+ New Document</button>
          </div>}
        </main>
      </div>
      <p className="sr-only" role="status">{announcement}</p>
      {prompt?.kind === "unsaved" && <NativeDialog error={dialogError} key="unsaved" title="Save your changes?" description={<>Your edits to ‘{values.name || "untitled-document.md"}’ have not been saved.</>} onCancel={cancelPrompt} onClosed={dialogClosed}>
        <button type="button" className="button-primary" aria-busy={busy} onClick={() => void continueUnsaved("save")}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? "Saving…" : "Save & Continue"}</button>
        <button type="button" className="button-secondary" onClick={() => void continueUnsaved("discard")}>Discard changes</button>
        <button type="button" className="button-text" data-initial-focus onClick={cancelPrompt}>Cancel</button>
      </NativeDialog>}
      {prompt?.kind === "delete" && <NativeDialog error={dialogError} key="delete" title="Delete this document?" description={<>Are you sure you want to delete the ‘{prompt.name}’ document and its contents? This action cannot be reversed.</>} onCancel={cancelPrompt} onClosed={dialogClosed}>
        <button type="button" className="button-primary" aria-busy={busy} onClick={() => void confirmDelete()}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? "Deleting…" : "Confirm & Delete"}</button>
        <button type="button" className="button-text" data-initial-focus onClick={cancelPrompt}>Cancel</button>
      </NativeDialog>}
      {prompt?.kind === "reset" && <NativeDialog error={dialogError} key="reset" title="Reset unreadable saved documents?" description="This replaces the unreadable saved documents with the two starter documents. Download the storage backup and your current draft first. Newer changes from another tab are never overwritten." onCancel={cancelPrompt} onClosed={dialogClosed}>
        <button type="button" className="button-primary" aria-busy={busy} onClick={() => void resetInvalid()}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? "Resetting…" : "Reset saved documents"}</button>
        <button type="button" className="button-text" data-initial-focus onClick={cancelPrompt}>Cancel</button>
      </NativeDialog>}
    </div>;
  }}</form.Subscribe>;
}
