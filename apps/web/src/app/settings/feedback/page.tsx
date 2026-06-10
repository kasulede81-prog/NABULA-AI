"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

const CATEGORIES = [
  { id: "bug", label: "Bug report" },
  { id: "feature", label: "Feature request" },
  { id: "general", label: "General" },
  { id: "other", label: "Other" },
] as const;

export default function FeedbackPage() {
  const [category, setCategory] = useState<string>("general");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.submitFeedback(category, message.trim());
      setSent(true);
      setMessage("");
    } catch (err) {
      const e = err as { error?: { message?: string } };
      setError(e.error?.message ?? "Failed to send feedback");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-xs text-gray-500 hover:text-gray-300">
          ← Back to projects
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-white">Send Feedback</h1>
        <p className="text-sm text-gray-500">
          Help us improve Ugazon dev — bugs, ideas, or general comments.
        </p>
      </div>

      {sent && (
        <p className="rounded border border-green-800/40 bg-green-950/20 px-4 py-3 text-sm text-green-400">
          Thank you! Your feedback has been submitted.
        </p>
      )}

      <div className="space-y-4 rounded-lg border border-surface-border bg-surface-card p-5">
        <div>
          <label className="text-xs text-gray-500">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded border border-surface-border bg-surface px-3 py-2 text-sm text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="Describe your feedback..."
            className="mt-1 w-full rounded border border-surface-border bg-surface px-3 py-2 text-sm text-white"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button onClick={handleSubmit} loading={loading} disabled={!message.trim()}>
          Submit feedback
        </Button>
      </div>

      <p className="text-xs text-gray-600">
        Also see{" "}
        <Link href="/settings/billing" className="text-nebula-400 hover:underline">
          Billing & Support
        </Link>{" "}
        for Pro upgrades.
      </p>
    </div>
  );
}
