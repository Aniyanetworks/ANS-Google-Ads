"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { trackConversion } from "@/lib/analytics";

export default function ConversionPing() {
  const searchParams = useSearchParams();

  useEffect(() => {
    trackConversion(searchParams.get("label") ?? undefined);
  }, [searchParams]);

  return null;
}
