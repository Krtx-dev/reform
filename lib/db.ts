import Dexie, { type Table } from "dexie";
import type { MaterialRemnant, ProductionPlan, ProductTemplate } from "@/core/domain/types";
import type { ProjectSettings } from "@/stores/types";

export interface ProjectRow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  kind: "demo" | "custom";
  settings: ProjectSettings;
}

export interface Scoped<T> {
  key: string; // `${projectId}::${id}`
  projectId: string;
  data: T;
}

export interface KV {
  key: string;
  value: unknown;
}

class ReformDB extends Dexie {
  projects!: Table<ProjectRow, string>;
  remnants!: Table<Scoped<MaterialRemnant>, string>;
  products!: Table<Scoped<ProductTemplate>, string>;
  plans!: Table<Scoped<ProductionPlan>, string>;
  kv!: Table<KV, string>;

  constructor() {
    super("reform");
    this.version(1).stores({
      projects: "id, updatedAt",
      remnants: "key, projectId",
      products: "key, projectId",
      plans: "key, projectId",
      kv: "key",
    });
  }
}

let _db: ReformDB | null = null;
export function db(): ReformDB {
  if (!_db) _db = new ReformDB();
  return _db;
}

export const scopedKey = (projectId: string, id: string) => `${projectId}::${id}`;
