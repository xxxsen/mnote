export function formatAssetSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function resolveAssetURL(value: string) {
  if (!value || /^https?:\/\//i.test(value) || !value.startsWith("/")) return value;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";
  if (!/^https?:\/\//i.test(apiBase)) return value;
  try {
    return `${new URL(apiBase).origin}${value}`;
  } catch {
    return value;
  }
}

export function assetMarkdown(name: string, url: string) {
  return `![${name}](${url})`;
}
