/// <reference lib="webworker" />
import { createOptimizationSession, type OptimizationSession } from "@/core/optimization/engine";
import { runBenchmark } from "@/core/optimization/benchmark";
import type { WorkerRequest, WorkerResponse } from "./protocol";

/**
 * Optimization worker. The engine runs in short time slices (≈40 ms) and yields to the
 * event loop between slices, so "cancel" messages are processed promptly and progress
 * reports reflect real iteration counts.
 */
const ctx = self as unknown as DedicatedWorkerGlobalScope;
const sessions = new Map<number, OptimizationSession>();
const cancelledBench = new Set<number>();
const post = (m: WorkerResponse) => ctx.postMessage(m);
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function runOptimize(jobId: number, session: OptimizationSession) {
  let lastScore = -1;
  for (;;) {
    let done: boolean;
    try {
      done = session.step(40);
    } catch (e) {
      post({ type: "error", jobId, message: e instanceof Error ? e.message : String(e) });
      sessions.delete(jobId);
      return;
    }
    const progress = session.progress();
    let bestPlacements;
    if (progress.bestScore !== lastScore) {
      lastScore = progress.bestScore;
      const r = session.result();
      bestPlacements = r.ok ? r.placements : undefined;
    }
    post({ type: "progress", jobId, progress, bestPlacements });
    if (done) break;
    await tick();
  }
  post({ type: "result", jobId, result: session.result() });
  sessions.delete(jobId);
}

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === "cancel") {
    sessions.get(msg.jobId)?.cancel();
    cancelledBench.add(msg.jobId);
    return;
  }
  if (msg.type === "optimize") {
    try {
      const s = createOptimizationSession(msg.request);
      sessions.set(msg.jobId, s);
      await runOptimize(msg.jobId, s);
    } catch (e) {
      post({ type: "error", jobId: msg.jobId, message: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  if (msg.type === "benchmark") {
    try {
      const results = [];
      for (let i = 0; i < msg.inputs.length; i++) {
        if (cancelledBench.has(msg.jobId)) break;
        post({ type: "benchmark-progress", jobId: msg.jobId, done: i, total: msg.inputs.length, current: msg.inputs[i].name });
        await tick();
        results.push(runBenchmark(msg.inputs[i], msg.options));
      }
      post({ type: "benchmark-result", jobId: msg.jobId, results });
    } catch (e) {
      post({ type: "error", jobId: msg.jobId, message: e instanceof Error ? e.message : String(e) });
    }
  }
};
