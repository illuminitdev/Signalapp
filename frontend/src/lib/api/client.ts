export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const GET_TTL_MS = 60_000;
const NEVER_CACHE = [
  /^\/v1\/auth\//,
  /^\/v1\/research-runs\//,
  /^\/v1\/imports\//,
  /\/research-runs(\?|$)/,
  /\/imports(\?|$)/,
];
const getCache = new Map<string, { data: unknown; at: number }>();
const inFlight = new Map<string, Promise<unknown>>();

export function clearApiCache() {
  getCache.clear();
  inFlight.clear();
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const needsDefaultBody =
    options.body === undefined && ["POST", "PUT", "PATCH"].includes(method);
  const body = needsDefaultBody ? "{}" : options.body;
  const hasBody = body !== undefined && body !== null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };

  // Only send content-type: application/json if there is an actual payload body
  if (hasBody && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    body,
    headers,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? "request_error",
      data?.error?.message ?? res.statusText,
      data?.error?.details,
    );
  }
  return data as T;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    clearApiCache();
    return request<T>(path, options);
  }

  const bypassCache = NEVER_CACHE.some((pattern) => pattern.test(path));
  if (bypassCache) {
    return request<T>(path, options);
  }

  const cached = getCache.get(path);
  if (cached && Date.now() - cached.at < GET_TTL_MS) {
    return cached.data as T;
  }

  const running = inFlight.get(path);
  if (running) {
    return running as Promise<T>;
  }

  const promise = request<T>(path, options)
    .then((data) => {
      getCache.set(path, { data, at: Date.now() });
      return data;
    })
    .finally(() => {
      inFlight.delete(path);
    });

  inFlight.set(path, promise);
  return promise;
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Download failed: ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
