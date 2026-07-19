import { AuthenticatedBoundary } from "@/components/authenticated-boundary";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account settings",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedBoundary>{children}</AuthenticatedBoundary>;
}
