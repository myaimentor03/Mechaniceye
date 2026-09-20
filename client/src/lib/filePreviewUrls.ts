/**
 * Stable per-file preview URL lifecycle for evidence photo thumbnails.
 *
 * The previous PhotoRecorder created object URLs inside render via
 * `useMemo(() => files.map(URL.createObjectURL))`. That runs as a render
 * side effect (double-invoked in StrictMode, leaking one set of URLs) and
 * regenerates URLs for *every* existing photo whenever the files array
 * reference changes — causing thumbnail flicker/reload on mobile and
 * wasted blob URLs.
 *
 * This module keeps URLs keyed by File object identity:
 * - existing File objects reuse their URL (no flicker),
 * - only added files get a new URL,
 * - removed files have their URL revoked exactly once,
 * - nothing is created during render (all work happens in effects).
 */
import { useEffect, useRef, useState } from "react";

export type CreateUrl = (file: File) => string;
export type RevokeUrl = (url: string) => void;

/**
 * Pure map sync, unit-testable without DOM.
 * Reuses URLs for File identities still present, revokes URLs for removed
 * files, and creates URLs only for added files.
 */
export function syncFilePreviewUrls(
  prev: ReadonlyMap<File, string>,
  files: readonly File[],
  createUrl: CreateUrl,
  revokeUrl: RevokeUrl,
): Map<File, string> {
  const next = new Map<File, string>();
  for (const file of files) {
    const existing = prev.get(file);
    if (existing !== undefined) {
      next.set(file, existing);
    } else if (!next.has(file)) {
      next.set(file, createUrl(file));
    }
  }
  for (const [file, url] of prev) {
    if (!next.has(file)) {
      try {
        revokeUrl(url);
      } catch {
        // Revocation must never break thumbnail rendering.
      }
    }
  }
  return next;
}

/**
 * React hook returning preview URLs aligned with `files` order.
 * URLs are stable per File identity across array-reference changes.
 */
export function useFilePreviewUrls(files: readonly File[]): string[] {
  const cacheRef = useRef<Map<File, string>>(new Map());
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const next = syncFilePreviewUrls(
      cacheRef.current,
      files,
      (file) => URL.createObjectURL(file),
      (url) => URL.revokeObjectURL(url),
    );
    cacheRef.current = next;
    setUrls(files.map((file) => next.get(file)).filter((url): url is string => typeof url === "string"));
  }, [files]);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      for (const url of cache.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore cleanup errors on unmount.
        }
      }
      cache.clear();
    };
  }, []);

  return urls;
}
