const TOKEN_KEY = "nebula_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function hasStoredToken(): boolean {
  return !!getStoredToken();
}
