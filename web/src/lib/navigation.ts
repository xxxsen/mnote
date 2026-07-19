export function getSafeInternalReturn(
  value: string | null | undefined,
  fallback = "/docs",
): string {
  if (!value) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (
    !decoded.startsWith("/")
    || decoded.startsWith("//")
    || decoded.includes("\\")
    || /^[a-z][a-z0-9+.-]*:/i.test(decoded)
  ) {
    return fallback;
  }

  return decoded;
}
