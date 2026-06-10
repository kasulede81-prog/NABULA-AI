"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Database,
  Plus,
  Search,
  Trash2,
  Edit3,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  FileText,
  Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const PAGE_SIZE = 8;

export function DatabaseTab({ projectId }: { projectId: string }) {
  const [table, setTable] = useState<"notes" | "recordings">("notes");

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Database className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Database</span>
        <div className="ml-3 flex items-center gap-0.5 rounded-lg border border-border bg-secondary/60 p-0.5">
          {(["notes", "recordings"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTable(t)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-smooth",
                table === t
                  ? "bg-background text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              public.{t}
            </button>
          ))}
        </div>
      </div>
      {table === "notes" ? (
        <NotesTable projectId={projectId} />
      ) : (
        <RecordingsTable projectId={projectId} />
      )}
    </div>
  );
}

function NotesTable({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<
    Array<{ id: string; title: string; content: string; tags: string[]; updatedAt: string }>
  >([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{
    id?: string;
    title: string;
    content: string;
    tags: string[];
  } | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listProjectNotes(projectId, { q, page });
      setRows(res.data.rows);
      setCount(res.data.count);
    } finally {
      setLoading(false);
    }
  }, [projectId, q, page]);

  useEffect(() => {
    setPage(0);
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (n: {
    id?: string;
    title: string;
    content: string;
    tags: string[];
  }) => {
    await api.saveProjectNote(projectId, n);
    setEditing(null);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    await api.deleteProjectNote(projectId, id);
    await load();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar
        q={q}
        setQ={setQ}
        count={count}
        onNew={() => setEditing({ title: "", content: "", tags: [] })}
        placeholder="Search notes…"
      />
      {loading ? (
        <Loading />
      ) : (
        <DataTable
          rows={rows}
          empty="No notes yet"
          columns={["title", "tags", "updated"]}
          renderRow={(n) => (
            <>
              <td className="px-4 py-2.5 align-top font-mono">
                <span className="font-medium">{n.title}</span>
                <div className="mt-0.5 line-clamp-1 font-sans text-[10px] text-muted-foreground">
                  {n.content}
                </div>
              </td>
              <td className="px-4 py-2.5 align-top font-mono">
                <div className="flex flex-wrap gap-1">
                  {n.tags.map((t, i) => (
                    <span
                      key={i}
                      className="rounded bg-secondary px-1.5 py-0.5 text-[10px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2.5 align-top font-mono">
                {new Date(n.updatedAt).toLocaleString()}
              </td>
            </>
          )}
          onEdit={(n) =>
            setEditing({
              id: n.id,
              title: n.title,
              content: n.content,
              tags: n.tags,
            })
          }
          onDelete={(n) => void remove(n.id)}
        />
      )}
      <Pagination
        page={page}
        setPage={setPage}
        totalPages={totalPages}
        count={count}
      />
      {editing && (
        <NoteEditor
          note={editing}
          onClose={() => setEditing(null)}
          onSave={(n) => void save(n)}
        />
      )}
    </div>
  );
}

function RecordingsTable({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      title: string;
      durationSeconds: number;
      transcript: string;
      createdAt: string;
    }>
  >([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{
    id?: string;
    title: string;
    durationSeconds: number;
    transcript: string;
  } | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listProjectRecordings(projectId, { q, page });
      setRows(res.data.rows);
      setCount(res.data.count);
    } finally {
      setLoading(false);
    }
  }, [projectId, q, page]);

  useEffect(() => {
    setPage(0);
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (r: {
    id?: string;
    title: string;
    durationSeconds: number;
    transcript: string;
  }) => {
    await api.saveProjectRecording(projectId, r);
    setEditing(null);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this recording?")) return;
    await api.deleteProjectRecording(projectId, id);
    await load();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar
        q={q}
        setQ={setQ}
        count={count}
        onNew={() =>
          setEditing({ title: "", durationSeconds: 0, transcript: "" })
        }
        placeholder="Search recordings…"
        icon={Mic}
      />
      {loading ? (
        <Loading />
      ) : (
        <DataTable
          rows={rows}
          empty="No recordings yet"
          columns={["title", "duration", "created"]}
          renderRow={(r) => (
            <>
              <td className="px-4 py-2.5 align-top font-mono">
                <span className="font-medium">{r.title}</span>
                <div className="mt-0.5 line-clamp-1 font-sans text-[10px] text-muted-foreground">
                  {r.transcript}
                </div>
              </td>
              <td className="px-4 py-2.5 align-top font-mono">
                {Math.floor(r.durationSeconds / 60)}:
                {(r.durationSeconds % 60).toString().padStart(2, "0")}
              </td>
              <td className="px-4 py-2.5 align-top font-mono">
                {new Date(r.createdAt).toLocaleString()}
              </td>
            </>
          )}
          onEdit={(r) =>
            setEditing({
              id: r.id,
              title: r.title,
              durationSeconds: r.durationSeconds,
              transcript: r.transcript,
            })
          }
          onDelete={(r) => void remove(r.id)}
        />
      )}
      <Pagination
        page={page}
        setPage={setPage}
        totalPages={totalPages}
        count={count}
      />
      {editing && (
        <RecordingEditor
          rec={editing}
          onClose={() => setEditing(null)}
          onSave={(r) => void save(r)}
        />
      )}
    </div>
  );
}

function Toolbar({
  q,
  setQ,
  count,
  onNew,
  placeholder,
  icon: Icon = FileText,
}: {
  q: string;
  setQ: (v: string) => void;
  count: number;
  onNew: () => void;
  placeholder: string;
  icon?: typeof FileText;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3">
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-input/60 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>
      <span className="font-mono text-xs text-muted-foreground">
        {count} rows
      </span>
      <button
        type="button"
        onClick={onNew}
        className="ml-auto flex items-center gap-1.5 rounded-md bg-gradient-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-glow hover:opacity-95"
      >
        <Plus className="h-3 w-3" /> New
      </button>
    </div>
  );
}

function DataTable<T extends { id: string }>({
  rows,
  empty,
  columns,
  renderRow,
  onEdit,
  onDelete,
}: {
  rows: T[];
  empty: string;
  columns: string[];
  renderRow: (row: T) => ReactNode;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
}) {
  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <table className="w-full text-xs">
        <thead className="sticky top-0 border-b border-border bg-card text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="px-4 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider"
              >
                {c}
              </th>
            ))}
            <th className="w-16 px-4 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-wider">
              actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="group border-b border-border/40 transition-smooth hover:bg-secondary/40"
            >
              {renderRow(row)}
              <td className="px-4 py-2.5 text-right align-top">
                <div className="flex justify-end gap-1 opacity-0 transition-smooth group-hover:opacity-100">
                  <RowBtn icon={Edit3} onClick={() => onEdit(row)} />
                  <RowBtn icon={Trash2} onClick={() => onDelete(row)} />
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + 1}
                className="py-12 text-center text-sm text-muted-foreground"
              >
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RowBtn({
  icon: Icon,
  onClick,
}: {
  icon: typeof Edit3;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}

function Loading() {
  return (
    <div className="grid flex-1 place-items-center">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    </div>
  );
}

function Pagination({
  page,
  setPage,
  totalPages,
  count,
}: {
  page: number;
  setPage: (fn: (p: number) => number) => void;
  totalPages: number;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
      <span>{count} total</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="grid h-7 w-7 place-items-center rounded hover:bg-secondary disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="font-mono">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="grid h-7 w-7 place-items-center rounded hover:bg-secondary disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function NoteEditor({
  note,
  onClose,
  onSave,
}: {
  note: { id?: string; title: string; content: string; tags: string[] };
  onClose: () => void;
  onSave: (n: {
    id?: string;
    title: string;
    content: string;
    tags: string[];
  }) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState(note.tags.join(", "));

  return (
    <Modal title={note.id ? "Edit note" : "New note"} onClose={onClose}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full rounded-md border border-border bg-input/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="Content"
        className="w-full resize-none rounded-md border border-border bg-input/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="tags, comma, separated"
        className="w-full rounded-md border border-border bg-input/60 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <button
        type="button"
        onClick={() =>
          onSave({
            ...note,
            title,
            content,
            tags: tags
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        className="w-full rounded-md bg-gradient-primary py-2 text-sm font-medium text-primary-foreground shadow-glow"
      >
        Save
      </button>
    </Modal>
  );
}

function RecordingEditor({
  rec,
  onClose,
  onSave,
}: {
  rec: {
    id?: string;
    title: string;
    durationSeconds: number;
    transcript: string;
  };
  onClose: () => void;
  onSave: (r: {
    id?: string;
    title: string;
    durationSeconds: number;
    transcript: string;
  }) => void;
}) {
  const [title, setTitle] = useState(rec.title);
  const [duration, setDuration] = useState(rec.durationSeconds);
  const [transcript, setTranscript] = useState(rec.transcript);

  return (
    <Modal title={rec.id ? "Edit recording" : "New recording"} onClose={onClose}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full rounded-md border border-border bg-input/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <input
        type="number"
        value={duration}
        onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
        placeholder="Duration (seconds)"
        className="w-full rounded-md border border-border bg-input/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={6}
        placeholder="Transcript"
        className="w-full resize-none rounded-md border border-border bg-input/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <button
        type="button"
        onClick={() =>
          onSave({ ...rec, title, durationSeconds: duration, transcript })
        }
        className="w-full rounded-md bg-gradient-primary py-2 text-sm font-medium text-primary-foreground shadow-glow"
      >
        Save
      </button>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-fade-in-up w-[440px] max-w-[92vw] space-y-3 rounded-2xl border border-border bg-card p-5 shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
