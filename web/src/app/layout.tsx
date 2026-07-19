import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { ToastProvider } from "@/components/ui/toast";


export const metadata: Metadata = {
  title: {
    default: "Micro Note",
    template: "%s · Micro Note",
  },
  description: "Minimal Markdown Notes",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="flex min-h-dvh flex-col bg-background text-foreground antialiased"
      >
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
