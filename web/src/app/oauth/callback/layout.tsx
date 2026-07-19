import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OAuth callback",
};

export default function OAuthCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
