"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface FileNode {
  path: string;
  version: number;
}

interface FileTreeProps {
  projectId: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
  refreshKey?: number;
}

function buildTree(paths: string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const path of paths.sort()) {
    const parts = path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = path;
      } else {
        if (!current[part] || typeof current[part] === "string") {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
    }
  }
  return root;
}

function TreeNode({
  name,
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  name: string;
  node: unknown;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const padding = depth * 12;

  if (typeof node === "string") {
    const isSelected = selectedPath === node;
    return (
      <button
        onClick={() => onSelect(node)}
        className={`block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-surface-border ${
          isSelected ? "bg-nebula-600/20 text-nebula-100" : "text-gray-300"
        }`}
        style={{ paddingLeft: padding + 8 }}
      >
        📄 {name}
      </button>
    );
  }

  const children = node as Record<string, unknown>;
  return (
    <div>
      <div
        className="truncate px-2 py-1 text-sm text-gray-400"
        style={{ paddingLeft: padding + 8 }}
      >
        📁 {name}
      </div>
      {Object.entries(children).map(([childName, childNode]) => (
        <TreeNode
          key={childName}
          name={childName}
          node={childNode}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function FileTree({
  projectId,
  selectedPath,
  onSelect,
  onRefresh,
  refreshKey = 0,
}: FileTreeProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .listFiles(projectId)
      .then((res) => setFiles(res.data))
      .finally(() => setLoading(false));
  }, [projectId, refreshKey]);

  const tree = buildTree(files.map((f) => f.path));

  const handleNewFile = async () => {
    const path = window.prompt("New file path (e.g. src/components/New.tsx)");
    if (!path?.trim()) return;
    setBusy(true);
    try {
      await api.writeFile(projectId, path.trim(), "");
      onRefresh();
      onSelect(path.trim());
    } catch {
      window.alert("Failed to create file");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!selectedPath) return;
    const toPath = window.prompt("Rename to:", selectedPath);
    if (!toPath?.trim() || toPath === selectedPath) return;
    setBusy(true);
    try {
      await api.renameFile(projectId, selectedPath, toPath.trim());
      onRefresh();
      onSelect(toPath.trim());
    } catch {
      window.alert("Failed to rename file");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPath) return;
    if (!window.confirm(`Delete ${selectedPath}?`)) return;
    setBusy(true);
    try {
      await api.deleteFile(projectId, selectedPath);
      onRefresh();
    } catch {
      window.alert("Failed to delete file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-surface-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Files</h2>
          <div className="flex gap-1">
            <button
              type="button"
              title="New file"
              disabled={busy}
              onClick={handleNewFile}
              className="rounded px-1.5 text-xs text-gray-400 hover:bg-surface-border hover:text-white"
            >
              +
            </button>
            <button
              type="button"
              title="Rename"
              disabled={busy || !selectedPath}
              onClick={handleRename}
              className="rounded px-1.5 text-xs text-gray-400 hover:bg-surface-border hover:text-white"
            >
              R
            </button>
            <button
              type="button"
              title="Delete"
              disabled={busy || !selectedPath}
              onClick={handleDelete}
              className="rounded px-1.5 text-xs text-red-400 hover:bg-surface-border"
            >
              ×
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500">{files.length} files</p>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <p className="px-4 text-sm text-gray-500">Loading...</p>
        ) : files.length === 0 ? (
          <p className="px-4 text-sm text-gray-500">No files yet</p>
        ) : (
          Object.entries(tree).map(([name, node]) => (
            <TreeNode
              key={name}
              name={name}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
