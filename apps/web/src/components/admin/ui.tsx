"use client";

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-gray-500">
      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-nebula-500 border-t-transparent" />
      {message}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-6 text-center">
      <p className="text-sm text-red-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-xs text-nebula-400 hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card px-4 py-12 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}

export function TrendStatCard({
  label,
  value,
  changePercent,
  direction,
  suffix,
}: {
  label: string;
  value: string | number;
  changePercent?: number | null;
  direction?: "up" | "down" | "flat";
  suffix?: string;
}) {
  const trendColor =
    direction === "up"
      ? "text-emerald-400"
      : direction === "down"
        ? "text-red-400"
        : "text-gray-500";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "—";

  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">
        {value}
        {suffix && <span className="ml-1 text-sm text-gray-400">{suffix}</span>}
      </p>
      {changePercent !== undefined && changePercent !== null && (
        <p className={`mt-1 text-xs ${trendColor}`}>
          {arrow} {Math.abs(changePercent)}% vs prior period
        </p>
      )}
    </div>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full max-w-xs rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-nebula-500 focus:outline-none"
    />
  );
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded border border-surface-border px-3 py-1 text-xs text-gray-400 disabled:opacity-40"
      >
        Prev
      </button>
      <span className="text-xs text-gray-500">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded border border-surface-border px-3 py-1 text-xs text-gray-400 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}

export function SimpleBarChart({
  data,
  valueKey,
  labelKey,
  color = "bg-nebula-600",
}: {
  data: Array<Record<string, string | number | null>>;
  valueKey: string;
  labelKey: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((d) => {
        const val = Number(d[valueKey]) || 0;
        const h = Math.max(4, (val / max) * 100);
        return (
          <div key={String(d[labelKey])} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t ${color}`}
              style={{ height: `${h}%` }}
              title={`${d[labelKey]}: ${val}`}
            />
            <span className="truncate text-[9px] text-gray-600">
              {String(d[labelKey]).slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function HealthCard({
  service,
  status,
  latencyMs,
  lastCheck,
}: {
  service: string;
  status: string;
  latencyMs: number | null;
  lastCheck: string;
}) {
  const color =
    status === "healthy"
      ? "border-emerald-900/50 bg-emerald-950/20"
      : status === "degraded"
        ? "border-amber-900/50 bg-amber-950/20"
        : "border-red-900/50 bg-red-950/20";
  const dot =
    status === "healthy"
      ? "bg-emerald-500"
      : status === "degraded"
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="text-sm font-medium capitalize text-white">
          {service.replace(/_/g, " ")}
        </span>
        <span className="ml-auto text-xs capitalize text-gray-400">{status}</span>
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span>{latencyMs !== null ? `${latencyMs}ms` : "—"}</span>
        <span>{new Date(lastCheck).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

export function ActionBtn({
  children,
  onClick,
  variant = "default",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2 py-1 text-xs disabled:opacity-40 ${
        variant === "danger"
          ? "border border-red-800 text-red-400 hover:bg-red-950"
          : "border border-surface-border text-gray-300 hover:bg-surface-border/40"
      }`}
    >
      {children}
    </button>
  );
}
