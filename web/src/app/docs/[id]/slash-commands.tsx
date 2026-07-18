import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  ListChecks,
  Quote,
  FileCode,
  Table as TableIcon,
  Link2,
  ImageIcon,
  CalendarDays,
  Clock3,
  Minus,
} from "lucide-react";
import type { SlashCommand } from "./types";

const currentLocalDate = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "h1", label: "Heading 1", keywords: ["title", "#"], icon: <Heading1 className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "heading", level: 1 }) },
  { id: "h2", label: "Heading 2", keywords: ["subtitle", "##"], icon: <Heading2 className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "heading", level: 2 }) },
  { id: "h3", label: "Heading 3", keywords: ["section", "###"], icon: <Heading3 className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "heading", level: 3 }) },
  { id: "bold", label: "Bold", keywords: ["strong"], icon: <Bold className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "inline", mark: "bold" }) },
  { id: "italic", label: "Italic", keywords: ["emphasis"], icon: <Italic className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "inline", mark: "italic" }) },
  { id: "list", label: "Bullet List", keywords: ["unordered"], icon: <List className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "block", block: "bullet" }) },
  { id: "numlist", label: "Numbered List", keywords: ["ordered"], icon: <ListOrdered className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "block", block: "ordered" }) },
  { id: "todo", label: "Todo List", keywords: ["task", "checkbox"], icon: <ListTodo className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "block", block: "task" }) },
  { id: "done", label: "Done List", keywords: ["task done", "check"], icon: <ListChecks className="h-4 w-4" />, action: (s) => s.insertTextAtCursor("- [x] ") },
  { id: "quote", label: "Quote", keywords: ["blockquote"], icon: <Quote className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "block", block: "quote" }) },
  { id: "code", label: "Code Block", keywords: ["snippet"], icon: <FileCode className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "insert", item: "codeBlock" }) },
  { id: "table", label: "Table", keywords: ["grid"], icon: <TableIcon className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "insert", item: "table" }) },
  { id: "link", label: "Link", keywords: ["url"], icon: <Link2 className="h-4 w-4" />, action: (s) => s.executeCommand({ kind: "insert", item: "link" }) },
  { id: "image", label: "Image", keywords: ["media"], icon: <ImageIcon className="h-4 w-4" />, action: (s) => s.insertTextAtCursor("![alt](https://)") },
  { id: "callout", label: "Callout", keywords: ["note", "tip", "warning"], icon: <ListChecks className="h-4 w-4" />, action: (s) => s.insertTextAtCursor(":::info\nNote\n:::\n") },
  { id: "date", label: "Current Date", keywords: ["today", "time"], icon: <CalendarDays className="h-4 w-4" />, action: (s) => s.insertTextAtCursor(currentLocalDate()) },
  { id: "time", label: "Current Time", keywords: ["clock"], icon: <Clock3 className="h-4 w-4" />, action: (s) => s.insertTextAtCursor(new Date().toLocaleTimeString("en-US", { hour12: false })) },
  { id: "divider", label: "Divider", keywords: ["hr", "line"], icon: <Minus className="h-4 w-4" />, action: (s) => s.insertTextAtCursor("\n---\n") },
];
