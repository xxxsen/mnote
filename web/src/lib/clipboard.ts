export async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof document === "undefined" || typeof navigator === "undefined") return false;

  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      try {
        document.body.removeChild(textarea);
      } catch {
        // The temporary node may already have been detached by the host.
      }
    }
  };

  try {
    const clipboard = Reflect.get(navigator, "clipboard") as Clipboard | undefined;
    if (!clipboard) return fallbackCopy();
    await clipboard.writeText(value);
    return true;
  } catch {
    return fallbackCopy();
  }
}
