"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

function StatusRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
      <span>{label}</span>
      <span className={on ? "text-success" : "text-muted-foreground"}>
        {on ? "Configured" : "Not configured — set env vars"}
      </span>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.getIntegrations>
  >["data"] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    void api
      .getIntegrations()
      .then((res) => setData(res.data))
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) {
    return (
      <div className="p-6 text-sm text-red-400">
        Failed to load integration status — is the API running?
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading integration status…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status reflects server environment variables. Add keys to{" "}
          <code className="text-xs">.env</code> and restart the API.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">LLM providers</h2>
        <StatusRow label="Anthropic (Claude)" on={data.llm.providers.anthropic} />
        <StatusRow label="DeepSeek" on={data.llm.providers.deepseek} />
        <StatusRow label="OpenAI" on={data.llm.providers.openai} />
        <StatusRow label="Gemini" on={data.llm.providers.gemini} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Auth &amp; storage</h2>
        <StatusRow label="Google OAuth" on={data.auth.googleOAuth} />
        <StatusRow label="GitHub OAuth (login)" on={data.auth.githubOAuth} />
        <StatusRow label="Supabase file storage" on={data.infra.supabaseStorage} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Platform</h2>
        <StatusRow label="E2B preview" on={data.preview.e2b} />
        <StatusRow label="Vercel deploy" on={data.deploy.vercel} />
        <StatusRow label="Netlify deploy" on={data.deploy.netlify} />
        <StatusRow label="GitHub export OAuth" on={data.github.oauth} />
        <StatusRow label="Stripe billing" on={data.billing.stripe} />
        <StatusRow label="Redis" on={data.infra.redis} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Observability &amp; agents</h2>
        <StatusRow label="Sentry" on={data.observability.sentry} />
        <StatusRow label="PostHog" on={data.observability.posthog} />
        <StatusRow label="Resend email" on={data.email.resend} />
        <StatusRow label="Reviewer agent" on={data.agents.reviewer} />
        <StatusRow label="Bugbot (changeset review)" on={data.agents.bugbot} />
        <StatusRow
          label="AI Tab autocomplete"
          on={data.agents.tabAutocomplete}
        />
        <StatusRow label="@web search (Tavily)" on={data.agents.webSearch} />
      </section>
    </div>
  );
}
