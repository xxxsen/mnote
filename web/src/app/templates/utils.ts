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

export const resolveSystemVariableClient = (key: string) => {
  const now = new Date();
  const normalized = key.trim().toUpperCase();
  if (normalized === "SYS:TODAY" || normalized === "SYS:DATE") {
    return now.toISOString().slice(0, 10);
  }
  if (normalized === "SYS:TIME") {
    return now.toTimeString().slice(0, 5);
  }
  if (normalized === "SYS:DATETIME" || normalized === "SYS:NOW") {
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5);
    return `${date} ${time}`;
  }
  return "";
};
