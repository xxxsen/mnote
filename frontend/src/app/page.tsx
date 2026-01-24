"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/lib/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      router.push("/docs");
    } else {
      router.push("/login");
    }
  }, [router]);

  return null;
}
