import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared note",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
