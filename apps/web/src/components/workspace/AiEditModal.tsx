"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { languageForPath } from "@/lib/monaco-language";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false }
);

interface AiEditModalProps {
  projectId: string;
  path: string;
  originalContent: string;
  onClose: () => void;
  onApplied: (path: string, content: string, version: number) => void;
}

export function AiEditModal({
  projectId,
  path,
  originalContent,
  onClose,
  onApplied,
}: AiEditModalProps) {
  const [instruction, setInstruction] = useState("");
  const [modifiedContent, setModifiedContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePropose = async () => {
    if (!instruction.trim()) return;
    setLoading(true);
    setError(null);
    setModifiedContent(null);
    try {
      const res = await api.proposeAiEdit(projectId, path, instruction.trim());
      setModifiedContent(res.data.modifiedContent);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "AI edit failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!modifiedContent) return;
    setApplying(true);
    setError(null);
    try {
      const saved = await api.applyAiEdit(projectId, path, modifiedContent);
      if (saved.pendingReview) {
        setError("Change staged for review — open the changeset panel to apply.");
        return;
      }
      onApplied(path, modifiedContent, saved.version ?? 0);
    } catch (err) {
      const apiErr = err as { error?: { message?: string } };
      setError(apiErr.error?.message ?? "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const lang = languageForPath(path);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg border border-surface-border bg-surface shadow-xl">
        <div className="border-b border-surface-border px-4 py-3">
          <h3 className="text-sm font-medium text-white">AI Edit — {path}</h3>
          <p className="text-xs text-gray-500">
            Describe the change. Review the diff before applying.
          </p>
        </div>

        <div className="space-y-2 border-b border-surface-border px-4 py-3">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Add dark mode toggle, refactor this component..."
            className="w-full rounded border border-surface-border bg-[#1e1e1e] px-3 py-2 text-sm text-white"
            rows={2}
          />
          <Button
            className="text-xs"
            onClick={handlePropose}
            loading={loading}
            disabled={!instruction.trim()}
          >
            Generate changes
          </Button>
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-red-400">{error}</div>
        )}

        {modifiedContent != null && (
          <div className="min-h-[320px] flex-1 overflow-hidden">
            <div className="grid grid-cols-2 border-b border-surface-border text-center text-xs text-gray-500">
              <span className="py-1">Original</span>
              <span className="py-1">Updated</span>
            </div>
            <div className="h-[360px]">
              <DiffEditor
                original={originalContent}
                modified={modifiedContent}
                language={lang}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
          <Button variant="ghost" className="text-xs" onClick={onClose}>
            Cancel
          </Button>
          {modifiedContent != null && (
            <Button
              className="text-xs"
              onClick={handleApply}
              loading={applying}
            >
              Apply
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
