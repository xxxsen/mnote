import { AuthenticatedBoundary } from "@/components/authenticated-boundary";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tags",
};

export default function TagsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedBoundary>{children}</AuthenticatedBoundary>;
}
