const SECRET_KEY = /key|secret|password|token|authorization|api[_-]?key|exa/i;
const SECRET_VALUE =
  /(\bsk-[\w-]{8,}|\bexa_[\w-]{8,}|\bpat-[\w-]{8,}|\bBearer\s+[\w.~+/=-]{8,})/gi;

/** Configured secret values are redacted literally, whatever their shape (gate 12). */
function configuredSecrets(): string[] {
  return [process.env.EXA_API_KEY, process.env.AUTH_SECRET, process.env.HUBSPOT_ACCESS_TOKEN]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s && s.length >= 8));
}

/** Strip secret-looking keys/values from objects before logging or audit. */
export function redactSecrets<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = { ...input };
  for (const k of Object.keys(out)) {
    if (SECRET_KEY.test(k)) {
      delete out[k];
      continue;
    }
    const v = out[k];
    if (typeof v === "string") {
      out[k] = redactString(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactSecrets(v as Record<string, unknown>);
    }
  }
  return out as T;
}

export function redactString(message: string): string {
  let out = message;
  for (const secret of configuredSecrets()) out = out.split(secret).join("[redacted]");
  return out.replace(SECRET_VALUE, "[redacted]");
}
