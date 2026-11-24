"use client";

import { Suspense } from "react";
import { Studio } from "@/components/optimizer/Studio";

export default function OptimizerPage() {
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  );
}
