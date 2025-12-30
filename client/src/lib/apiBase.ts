export function apiBase(): string {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  if (!url) return "";
  return url.replace(/\/+$/, "");
}
