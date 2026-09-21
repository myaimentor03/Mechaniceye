import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const isFormData = data instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: data && !isFormData ? { "Content-Type": "application/json" } : {},
    body: data ? (isFormData ? data : JSON.stringify(data)) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export interface UploadProgressCallback {
  (progress: number): void;
}

export async function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: UploadProgressCallback
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.withCredentials = true;

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      // Prefer responseText for string bodies; xhr.response is empty unless
      // responseType is set. Keep statusText fallback but surface server body
      // so layperson error toasts are truthful (e.g. 507 persistence failed).
      const bodyText = typeof xhr.responseText === "string" && xhr.responseText.length > 0
        ? xhr.responseText
        : typeof xhr.response === "string" ? xhr.response : "";
      const response = new Response(bodyText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: {
          "Content-Type": xhr.getResponseHeader("Content-Type") || "application/json",
        },
      });
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response);
      } else {
        // Truthful error: include server-provided message when available.
        let serverMessage = bodyText;
        try {
          const parsed = bodyText ? JSON.parse(bodyText) : null;
          if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
            serverMessage = parsed.message.trim();
          } else if (parsed && typeof parsed.error === "string" && parsed.error.trim()) {
            serverMessage = parsed.error.trim();
          }
        } catch {
          // body is not JSON; use raw text
        }
        const detail = serverMessage || xhr.statusText || "Upload failed";
        reject(new Error(`${xhr.status}: ${detail}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload aborted"));
    });

    xhr.send(formData);
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
