"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

interface InlineEditPopoverProps {
  projectId: string;
  path: string;
  selectedText: string;
  onClose: () => void;
  onApplied: (path: string, content: string, version: number) => void;
}

export function InlineEditPopover({
  projectId,
  path,
  selectedText,
  onClose,
  onApplied,
}: InlineEditPopoverProps) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!instruction.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.proposeAiEdit(
        projectId,
        path,
        instruction.trim(),
        { selectedText }
      );
      const saved = await api.applyAiEdit(
        projectId,
        path,
        res.data.modifiedContent
      );
      if (saved.pendingReview || saved.version == null) {
        // null version means the write was staged, not committed to the VFS.
        setError("Change staged for review — open the changeset panel to apply.");
        return;
      }
      onApplied(path, res.data.modifiedContent, saved.version);
      onClose();
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Edit failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute left-1/2 top-12 z-20 w-[min(420px,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-border bg-popover p-3 shadow-elegant">
      <div className="mb-1 text-xs font-medium text-foreground">
        Edit selection (⌘K)
      </div>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Describe the change for the selected code…"
        rows={2}
        autoFocus
        className="mb-2 w-full resize-none rounded border border-border bg-input/40 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
          }
        }}
      />
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="px-2 py-1 text-xs"
          onClick={() => void handleSubmit()}
          loading={loading}
          disabled={!instruction.trim()}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
