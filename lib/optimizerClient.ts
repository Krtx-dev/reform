"use client";

import type { BenchmarkResult, OptimizationRequest, OptimizationResult, Placement } from "@/core/domain/types";
import type { BenchmarkInput, BenchmarkOptions } from "@/core/optimization/benchmark";
import type { ProgressInfo } from "@/core/optimization/engine";
import type { WorkerRequest, WorkerResponse } from "@/workers/protocol";

let worker: Worker | null = null;
let nextJob = 1;
type Handler = (m: WorkerResponse) => void;
const handlers = new Map<number, Handler>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/optimizer.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => handlers.get(ev.data.jobId)?.(ev.data);
  worker.onerror = (ev) => {
    const message = ev.message || "The optimization worker crashed.";
    for (const [id, h] of handlers) h({ type: "error", jobId: id, message });
    handlers.clear();
    worker?.terminate();
    worker = null; // recreate on next run (error recovery)
  };
  return worker;
}

const send = (m: WorkerRequest) => getWorker().postMessage(m);

export interface RunHandle<T> {
  jobId: number;
  promise: Promise<T>;
  cancel(): void;
}

export function runOptimization(request: OptimizationRequest, onProgress?: (p: ProgressInfo, best?: Placement[]) => void): RunHandle<OptimizationResult> {
  const jobId = nextJob++;
  const promise = new Promise<OptimizationResult>((resolve, reject) => {
    handlers.set(jobId, (m) => {
      if (m.type === "progress") onProgress?.(m.progress, m.bestPlacements);
      else if (m.type === "result") {
        handlers.delete(jobId);
        resolve(m.result);
      } else if (m.type === "error") {
        handlers.delete(jobId);
        reject(new Error(m.message));
      }
    });
    try {
      send({ type: "optimize", jobId, request });
    } catch (e) {
      handlers.delete(jobId);
      reject(e);
    }
  });
  return { jobId, promise, cancel: () => send({ type: "cancel", jobId }) };
}

export function runBenchmarks(inputs: BenchmarkInput[], options: BenchmarkOptions, onProgress?: (done: number, total: number, current: string) => void): RunHandle<BenchmarkResult[]> {
  const jobId = nextJob++;
  const promise = new Promise<BenchmarkResult[]>((resolve, reject) => {
    handlers.set(jobId, (m) => {
      if (m.type === "benchmark-progress") onProgress?.(m.done, m.total, m.current);
      else if (m.type === "benchmark-result") {
        handlers.delete(jobId);
        resolve(m.results);
      } else if (m.type === "error") {
        handlers.delete(jobId);
        reject(new Error(m.message));
      }
    });
    send({ type: "benchmark", jobId, inputs, options });
  });
  return { jobId, promise, cancel: () => send({ type: "cancel", jobId }) };
}
