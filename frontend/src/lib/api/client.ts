const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      // Fastify rejects a bodyless request that declares a JSON content-type (e.g. DELETE)
      ...(options.body != null ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
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
  if (NEVER_CACHE.some((re) => re.test(path))) return request<T>(path, options);

  const hit = getCache.get(path);
  if (hit && Date.now() - hit.at < GET_TTL_MS) return hit.data as T;
  const pending = inFlight.get(path);
  if (pending) return pending as Promise<T>;

  const p = request<T>(path, options)
    .then((data) => {
      getCache.set(path, { data, at: Date.now() });
      return data;
    })
    .finally(() => inFlight.delete(path));
  inFlight.set(path, p);
  return p;
}

export { API_URL };
