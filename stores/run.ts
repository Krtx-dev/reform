"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type { OptimizationResult, Placement } from "@/core/domain/types";
import type { ProgressInfo } from "@/core/optimization/engine";
import { runOptimization, type RunHandle } from "@/lib/optimizerClient";
import { useWorkspace } from "./workspace";

interface RunState {
  status: "idle" | "running" | "error";
  kind: "main" | "baseline" | null;
  progress: ProgressInfo | null;
  live: Placement[] | null;
  error: string | null;
  handle: RunHandle<OptimizationResult> | null;
  run(): Promise<OptimizationResult | null>;
  runBaseline(): Promise<OptimizationResult | null>;
  cancel(): void;
}

export const useRun = create<RunState>((set, get) => {
  const exec = async (kind: "main" | "baseline") => {
    if (get().status === "running") return null;
    const ws = useWorkspace.getState();
    const base = ws.buildRequest();
    if (!base) return null;
    const req = kind === "baseline" ? { ...base, algorithm: "shelf" as const } : base;
    set({ status: "running", kind, progress: null, live: null, error: null });
    const handle = runOptimization(req, (progress, best) => set((s) => ({ progress, live: best ?? s.live })));
    set({ handle });
    try {
      const result = await handle.promise;
      if (kind === "main") ws.setResult(req, result);
      else ws.setBaseline(result);
      set({ status: "idle", handle: null, live: null, kind: null });
      if (!result.ok) toast.error(result.error ?? "Optimization failed.");
      else if (kind === "main")
        toast.success(`${result.cancelled ? "Stopped early · best valid result kept · " : ""}${result.metrics.productsCompleted} complete products · ${(result.metrics.utilization * 100).toFixed(1)}% utilization`, { description: `${result.iterations} iterations in ${(result.runtimeMs / 1000).toFixed(2)} s · validation ${result.validation.valid ? "passed" : "FAILED"}` });
      else toast.success(`Baseline computed: ${(result.metrics.utilization * 100).toFixed(1)}% utilization`);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: message, handle: null, live: null, kind: null });
      toast.error(`Optimization worker error: ${message}`, { description: "The worker has been restarted. Try running again." });
      return null;
    }
  };
  return {
    status: "idle",
    kind: null,
    progress: null,
    live: null,
    error: null,
    handle: null,
    run: () => exec("main"),
    runBaseline: () => exec("baseline"),
    cancel: () => get().handle?.cancel(),
  };
});
