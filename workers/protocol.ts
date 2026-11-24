import type { BenchmarkResult, OptimizationRequest, OptimizationResult, Placement } from "@/core/domain/types";
import type { BenchmarkInput, BenchmarkOptions } from "@/core/optimization/benchmark";
import type { ProgressInfo } from "@/core/optimization/engine";

export type WorkerRequest =
  | { type: "optimize"; jobId: number; request: OptimizationRequest }
  | { type: "benchmark"; jobId: number; inputs: BenchmarkInput[]; options: BenchmarkOptions }
  | { type: "cancel"; jobId: number };

export type WorkerResponse =
  | { type: "progress"; jobId: number; progress: ProgressInfo; bestPlacements?: Placement[] }
  | { type: "result"; jobId: number; result: OptimizationResult }
  | { type: "benchmark-progress"; jobId: number; done: number; total: number; current: string }
  | { type: "benchmark-result"; jobId: number; results: BenchmarkResult[] }
  | { type: "error"; jobId: number; message: string };
