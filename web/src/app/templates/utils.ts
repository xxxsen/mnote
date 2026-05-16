export const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_:\-]+)\s*\}\}/g;
export const TEMPLATE_META_PAGE_LIMIT = 20;
export const MAX_TAGS = 7;
export const TAG_NAME_REGEX = /^[\p{Script=Han}A-Za-z0-9]{1,16}$/u;

export const normalizeTemplatePlaceholders = (content: string) =>
  content.replace(VARIABLE_REGEX, (_raw, key: string) => `{{${(key || "").trim().toUpperCase()}}}`);

export const formatTemplateMtime = (mtime: number) => {
  if (!mtime) return "Unknown";
  return new Date(mtime * 1000).toLocaleString();
};

const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatLocalTime = (d: Date) => {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
};

export const resolveSystemVariableClient = (key: string) => {
  const now = new Date();
  const normalized = key.trim().toUpperCase();
  if (normalized === "SYS:TODAY" || normalized === "SYS:DATE") {
    return formatLocalDate(now);
  }
  if (normalized === "SYS:TIME") {
    return formatLocalTime(now);
  }
  if (normalized === "SYS:DATETIME" || normalized === "SYS:NOW") {
    return `${formatLocalDate(now)} ${formatLocalTime(now)}`;
  }
  return "";
};
