import { AuthenticatedBoundary } from "@/components/authenticated-boundary";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tasks",
};

export default function TodosLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedBoundary>{children}</AuthenticatedBoundary>;
}
