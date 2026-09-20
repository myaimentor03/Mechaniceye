import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Mobile resilience (Nov 2 paid beta): the shared query/mutation helpers must
// never hang forever on a stalled mobile radio. Abort stuck requests so
// callers surface an AbortError instead of a frozen spinner.
const QUERY_TIMEOUT_MS = 15000;
const MUTATION_TIMEOUT_MS = 20000;

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MUTATION_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: data && !isFormData ? { "Content-Type": "application/json" } : {},
      body: data ? (isFormData ? data : JSON.stringify(data)) : undefined,
      credentials: "include",
      signal: controller.signal,
    });

    await throwIfResNotOk(res);
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      const res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
        signal: controller.signal,
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  };

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
