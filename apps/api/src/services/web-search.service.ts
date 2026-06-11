import { env } from "../config/env";
import { isPrivateHostname, resolvesToPrivate } from "../lib/ssrf-guard";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchService {
  isConfigured(): boolean {
    return env.TAVILY_API_KEY.length > 0;
  }

  /** Tavily search — enabled by setting TAVILY_API_KEY. */
  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    if (!this.isConfigured() || !query.trim()) return [];
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: env.TAVILY_API_KEY,
          query: query.slice(0, 300),
          max_results: maxResults,
          include_answer: false,
        }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      return (data.results ?? [])
        .filter((r) => r.url)
        .map((r) => ({
          title: r.title ?? r.url ?? "",
          url: r.url ?? "",
          snippet: (r.content ?? "").slice(0, 800),
        }));
    } catch {
      return [];
    }
  }

  /** Fetch a docs URL as plain text (for @docs:url mentions). */
  async fetchDocs(url: string): Promise<string | null> {
    // Follow redirects manually so every hop is SSRF-validated — a public
    // URL must not be able to 302 into the internal network.
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
      let parsed: URL;
      try {
        parsed = new URL(current);
      } catch {
        return null;
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return null;
      }
      const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
      if (
        isPrivateHostname(hostname) ||
        (await resolvesToPrivate(hostname))
      ) {
        return null;
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(parsed.toString(), {
          signal: controller.signal,
          headers: { "User-Agent": "NebulaDocsBot/1.0" },
          redirect: "manual",
        });
        clearTimeout(timer);

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location) return null;
          current = new URL(location, parsed).toString();
          continue;
        }

        if (!res.ok) return null;
        const contentType = res.headers.get("content-type") ?? "";
        if (!/text|html|json|markdown/i.test(contentType)) return null;
        const raw = (await res.text()).slice(0, 200_000);
        return htmlToText(raw).slice(0, 6000);
      } catch {
        return null;
      }
    }
    return null; // too many redirects
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export const webSearchService = new WebSearchService();
