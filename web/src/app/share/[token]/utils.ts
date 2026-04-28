export const GUEST_ANON_ID_KEY = "mnote_share_guest_id";

export const generateGuestAnonID = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export const isGuestAuthor = (author: string | undefined) => {
  const value = (author || "Guest").trim();
  return value === "Guest" || value.startsWith("Guest #");
};

export const guestFingerprint = (author: string | undefined) => {
  const value = (author || "").trim();
  const match = value.match(/^Guest\s*#([A-Za-z0-9]{4})$/);
  if (!match) return "";
  return match[1].toUpperCase();
};

export const estimateReadingTime = (content: string) => {
  const wordsPerMinute = 200;
  const wordCount = content.trim().split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
};
