const DEFAULT_APP_URL = "https://wallet-wrapped-mini.vercel.app";

type ResolveAppUrlOptions = {
  allowHttpLocalhost?: boolean;
  fallbackUrl?: string;
};

function hasProtocol(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
}

function normalizeUrlCandidate(value: string, allowHttpLocalhost: boolean): string | null {
  const candidate = hasProtocol(value) ? value : `https://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  if (parsed.protocol === "https:") {
    return `${parsed.protocol}//${parsed.host}`;
  }

  if (allowHttpLocalhost && parsed.protocol === "http:" && isLocalHostname(parsed.hostname)) {
    return `${parsed.protocol}//${parsed.host}`;
  }

  return null;
}

export function resolveAppUrl(rawUrl: string | null | undefined, options: ResolveAppUrlOptions = {}): string {
  const allowHttpLocalhost = options.allowHttpLocalhost ?? false;
  const fallbackUrl = options.fallbackUrl ?? DEFAULT_APP_URL;

  const normalizedFallback = normalizeUrlCandidate(fallbackUrl.trim(), allowHttpLocalhost);
  const safeFallback = normalizedFallback ?? DEFAULT_APP_URL;

  const normalizedRawUrl = normalizeUrlCandidate((rawUrl ?? "").trim(), allowHttpLocalhost);
  return normalizedRawUrl ?? safeFallback;
}

export { DEFAULT_APP_URL };
