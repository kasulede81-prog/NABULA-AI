"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface FileViewerProps {
  projectId: string;
  path: string | null;
  refreshKey?: number;
}

export function FileViewer({ projectId, path, refreshKey = 0 }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setContent(null);
      return;
    }

    setLoading(true);
    setError(null);
    api
      .readFile(projectId, path)
      .then((file) => {
        setContent(file.content);
        setVersion(file.version);
      })
      .catch(() => setError("Failed to load file"))
      .finally(() => setLoading(false));
  }, [projectId, path, refreshKey]);

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <p>Select a file to view</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
        <span className="truncate text-sm text-gray-300">{path}</span>
        {version && (
          <span className="text-xs text-gray-500">v{version}</span>
        )}
      </div>
      <pre className="flex-1 overflow-auto p-4 text-sm text-gray-200">
        <code>{content}</code>
      </pre>
    </div>
  );
}
