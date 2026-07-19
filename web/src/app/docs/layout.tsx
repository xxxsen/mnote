import { AuthenticatedBoundary } from "@/components/authenticated-boundary";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notes",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedBoundary>{children}</AuthenticatedBoundary>;
}
