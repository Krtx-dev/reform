"use client";

import { create } from "zustand";
import type { MaterialRemnant, OptimizationRequest, OptimizationResult, ProductionPlan, ProductTemplate } from "@/core/domain/types";
import { formatZodError, PROJECT_FORMAT, PROJECT_VERSION, projectFileSchema } from "@/core/domain/schemas";
import { requestHash } from "@/core/optimization/prepare";
import { commitPlan as commitPlanCore } from "@/core/production/commit";
import { DEMO_CONSTRAINTS, DEMO_INVENTORY } from "@/data/demo/inventory";
import { DEMO_DEMAND, DEMO_PRODUCTS } from "@/data/demo/products";
import { db, scopedKey, type ProjectRow } from "@/lib/db";
import { uid } from "@/lib/id";
import { DEFAULT_PREFS, DEFAULT_SETTINGS, type AppPrefs, type ProjectSettings } from "./types";

export const DEMO_PROJECT_ID = "demo-factory";

interface State {
  hydrated: boolean;
  dbError: string | null;
  pending: number;
  lastSavedAt: number | null;
  prefs: AppPrefs;
  projects: ProjectRow[];
  project: ProjectRow | null;
  remnants: MaterialRemnant[];
  products: ProductTemplate[];
  plans: ProductionPlan[];
}

interface Actions {
  init(): Promise<void>;
  setPrefs(p: Partial<AppPrefs>): void;
  createProject(kind: "demo" | "empty", name?: string): Promise<string>;
  switchProject(id: string): Promise<void>;
  renameProject(name: string): void;
  deleteProject(id: string): Promise<void>;
  resetDemo(): Promise<void>;
  clearAllData(): Promise<void>;

  upsertRemnant(r: MaterialRemnant): void;
  addRemnants(rs: MaterialRemnant[]): void;
  deleteRemnant(id: string): void;
  duplicateRemnant(id: string): string | null;
  adjustQuantity(id: string, delta: number): void;

  upsertProduct(p: ProductTemplate): void;
  deleteProduct(id: string): void;
  duplicateProduct(id: string): string | null;

  updateSettings(patch: Partial<ProjectSettings>): void;
  setDemand(productId: string, max: number, priority?: boolean): void;
  toggleRemnantExcluded(id: string): void;
  setResult(req: OptimizationRequest, result: OptimizationResult): void;
  setBaseline(result: OptimizationResult | null): void;

  savePlan(name: string, notes?: string): ProductionPlan | null;
  deletePlan(id: string): void;
  renamePlan(id: string, name: string): void;
  commitPlan(id: string): { ok: boolean; message: string };

  buildRequest(): OptimizationRequest | null;
  exportProject(): string;
  importProject(text: string): Promise<{ ok: boolean; message: string }>;
}

export type WorkspaceStore = State & Actions;

const settingsOf = (s: State) => s.project?.settings ?? DEFAULT_SETTINGS();

function demoSettings(): ProjectSettings {
  const s = DEFAULT_SETTINGS();
  s.constraints = { ...DEMO_CONSTRAINTS };
  for (const d of DEMO_DEMAND) s.demand[d.productId] = { max: d.max, priority: d.priority };
  return s;
}

export const useWorkspace = create<WorkspaceStore>((set, get) => {
  /** Run a persistence task and track it for the "saved locally" indicator. */
  const persist = (fn: () => Promise<unknown>) => {
    set((s) => ({ pending: s.pending + 1 }));
    fn()
      .then(() => set((s) => ({ pending: s.pending - 1, lastSavedAt: Date.now(), dbError: null })))
      .catch((e: unknown) => set((s) => ({ pending: s.pending - 1, dbError: e instanceof Error ? e.message : String(e) })));
  };

  const pid = () => get().project?.id ?? "";

  const saveProjectRow = (row: ProjectRow) => persist(() => db().projects.put(row));

  const patchProject = (patch: Partial<ProjectRow>) => {
    const p = get().project;
    if (!p) return;
    const next = { ...p, ...patch, updatedAt: Date.now() };
    set((s) => ({ project: next, projects: s.projects.map((x) => (x.id === next.id ? next : x)) }));
    saveProjectRow(next);
  };

  const seedProject = async (id: string, kind: "demo" | "empty", name: string) => {
    const now = Date.now();
    const row: ProjectRow = { id, name, createdAt: now, updatedAt: now, kind: kind === "demo" ? "demo" : "custom", settings: kind === "demo" ? demoSettings() : DEFAULT_SETTINGS() };
    if (kind === "empty") for (const p of DEMO_PRODUCTS) row.settings.demand[p.id] = { max: 0, priority: false };
    const d = db();
    await d.transaction("rw", [d.projects, d.remnants, d.products, d.plans], async () => {
      await d.remnants.where("projectId").equals(id).delete();
      await d.products.where("projectId").equals(id).delete();
      await d.plans.where("projectId").equals(id).delete();
      await d.projects.put(row);
      if (kind === "demo") await d.remnants.bulkPut(DEMO_INVENTORY.map((r) => ({ key: scopedKey(id, r.id), projectId: id, data: r })));
      await d.products.bulkPut(DEMO_PRODUCTS.map((p) => ({ key: scopedKey(id, p.id), projectId: id, data: p })));
    });
    return row;
  };

  const loadProject = async (id: string) => {
    const d = db();
    const [row, rem, prod, plans] = await Promise.all([
      d.projects.get(id),
      d.remnants.where("projectId").equals(id).toArray(),
      d.products.where("projectId").equals(id).toArray(),
      d.plans.where("projectId").equals(id).toArray(),
    ]);
    if (!row) return;
    row.settings = { ...DEFAULT_SETTINGS(), ...row.settings };
    set({
      project: row,
      remnants: rem.map((x) => x.data).sort((a, b) => a.createdAt - b.createdAt),
      products: prod.map((x) => x.data).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name)),
      plans: plans.map((x) => x.data).sort((a, b) => b.createdAt - a.createdAt),
    });
    await d.kv.put({ key: "currentProject", value: id });
  };

  return {
    hydrated: false,
    dbError: null,
    pending: 0,
    lastSavedAt: null,
    prefs: DEFAULT_PREFS,
    projects: [],
    project: null,
    remnants: [],
    products: [],
    plans: [],

    async init() {
      if (get().hydrated) return;
      try {
        const d = db();
        const prefsRow = await d.kv.get("prefs");
        const prefs = { ...DEFAULT_PREFS, ...((prefsRow?.value as Partial<AppPrefs>) ?? {}) };
        const projects = await d.projects.orderBy("updatedAt").reverse().toArray();
        set({ prefs, projects });
        const cur = (await d.kv.get("currentProject"))?.value as string | undefined;
        const target = projects.find((p) => p.id === cur)?.id ?? projects[0]?.id;
        if (target) await loadProject(target);
        set({ hydrated: true });
      } catch (e) {
        set({ hydrated: true, dbError: e instanceof Error ? e.message : String(e) });
      }
    },

    setPrefs(p) {
      const prefs = { ...get().prefs, ...p };
      set({ prefs });
      persist(() => db().kv.put({ key: "prefs", value: prefs }));
    },

    async createProject(kind, name) {
      const id = kind === "demo" ? DEMO_PROJECT_ID : uid("prj_");
      const row = await seedProject(id, kind, name ?? (kind === "demo" ? "Demonstration factory" : "New workspace"));
      set((s) => ({ projects: [row, ...s.projects.filter((p) => p.id !== id)] }));
      await loadProject(id);
      get().setPrefs({ onboarded: true });
      return id;
    },

    async switchProject(id) {
      await loadProject(id);
    },

    renameProject(name) {
      if (name.trim()) patchProject({ name: name.trim() });
    },

    async deleteProject(id) {
      const d = db();
      await d.transaction("rw", [d.projects, d.remnants, d.products, d.plans], async () => {
        await d.projects.delete(id);
        await d.remnants.where("projectId").equals(id).delete();
        await d.products.where("projectId").equals(id).delete();
        await d.plans.where("projectId").equals(id).delete();
      });
      const projects = get().projects.filter((p) => p.id !== id);
      set({ projects });
      if (get().project?.id === id) {
        if (projects[0]) await loadProject(projects[0].id);
        else set({ project: null, remnants: [], products: [], plans: [] });
      }
    },

    async resetDemo() {
      const row = await seedProject(DEMO_PROJECT_ID, "demo", "Demonstration factory");
      set((s) => ({ projects: [row, ...s.projects.filter((p) => p.id !== DEMO_PROJECT_ID)] }));
      await loadProject(DEMO_PROJECT_ID);
    },

    async clearAllData() {
      const d = db();
      await Promise.all([d.projects.clear(), d.remnants.clear(), d.products.clear(), d.plans.clear(), d.kv.clear()]);
      set({ projects: [], project: null, remnants: [], products: [], plans: [], prefs: DEFAULT_PREFS });
    },

    upsertRemnant(r) {
      const id = pid();
      if (!id) return;
      set((s) => ({ remnants: s.remnants.some((x) => x.id === r.id) ? s.remnants.map((x) => (x.id === r.id ? r : x)) : [...s.remnants, r] }));
      persist(() => db().remnants.put({ key: scopedKey(id, r.id), projectId: id, data: r }));
      patchProject({});
    },

    addRemnants(rs) {
      const id = pid();
      if (!id || rs.length === 0) return;
      set((s) => ({ remnants: [...s.remnants, ...rs] }));
      persist(() => db().remnants.bulkPut(rs.map((r) => ({ key: scopedKey(id, r.id), projectId: id, data: r }))));
      patchProject({});
    },

    deleteRemnant(rid) {
      const id = pid();
      set((s) => ({ remnants: s.remnants.filter((x) => x.id !== rid) }));
      persist(() => db().remnants.delete(scopedKey(id, rid)));
      const st = settingsOf(get());
      patchProject({ settings: { ...st, excludedRemnants: st.excludedRemnants.filter((x) => x !== rid) } });
    },

    duplicateRemnant(rid) {
      const r = get().remnants.find((x) => x.id === rid);
      if (!r) return null;
      const copy: MaterialRemnant = { ...r, id: uid("M-"), name: `${r.name} (copy)`, consumed: 0, createdAt: Date.now(), source: "manual" };
      get().upsertRemnant(copy);
      return copy.id;
    },

    adjustQuantity(rid, delta) {
      const r = get().remnants.find((x) => x.id === rid);
      if (!r) return;
      const quantity = Math.max(0, r.quantity + delta);
      get().upsertRemnant({ ...r, quantity, reserved: Math.min(r.reserved, quantity) });
    },

    upsertProduct(p) {
      const id = pid();
      if (!id) return;
      const isNew = !get().products.some((x) => x.id === p.id);
      set((s) => ({ products: isNew ? [...s.products, p] : s.products.map((x) => (x.id === p.id ? p : x)) }));
      persist(() => db().products.put({ key: scopedKey(id, p.id), projectId: id, data: p }));
      if (isNew) {
        const st = settingsOf(get());
        patchProject({ settings: { ...st, demand: { ...st.demand, [p.id]: { max: 0, priority: false } } } });
      } else patchProject({});
    },

    deleteProduct(prodId) {
      const id = pid();
      set((s) => ({ products: s.products.filter((x) => x.id !== prodId) }));
      persist(() => db().products.delete(scopedKey(id, prodId)));
      const st = settingsOf(get());
      const demand = { ...st.demand };
      delete demand[prodId];
      patchProject({ settings: { ...st, demand } });
    },

    duplicateProduct(prodId) {
      const p = get().products.find((x) => x.id === prodId);
      if (!p) return null;
      const copy: ProductTemplate = { ...p, id: uid("prod_"), name: `${p.name} (copy)`, builtin: false, createdAt: Date.now(), pieces: p.pieces.map((x) => ({ ...x })) };
      get().upsertProduct(copy);
      return copy.id;
    },

    updateSettings(patch) {
      patchProject({ settings: { ...settingsOf(get()), ...patch } });
    },

    setDemand(productId, max, priority) {
      const st = settingsOf(get());
      const cur = st.demand[productId] ?? { max: 0, priority: false };
      const m = Math.max(0, Math.min(1000, Math.floor(Number.isFinite(max) ? max : 0)));
      patchProject({ settings: { ...st, demand: { ...st.demand, [productId]: { max: m, priority: priority ?? cur.priority } } } });
    },

    toggleRemnantExcluded(rid) {
      const st = settingsOf(get());
      const has = st.excludedRemnants.includes(rid);
      patchProject({ settings: { ...st, excludedRemnants: has ? st.excludedRemnants.filter((x) => x !== rid) : [...st.excludedRemnants, rid] } });
    },

    setResult(req, result) {
      const st = settingsOf(get());
      patchProject({ settings: { ...st, lastRequest: req, previousResult: st.lastResult, lastResult: result } });
    },

    setBaseline(result) {
      patchProject({ settings: { ...settingsOf(get()), baselineResult: result } });
    },

    savePlan(name, notes = "") {
      const st = settingsOf(get());
      const id = pid();
      if (!st.lastResult || !st.lastRequest || !st.lastResult.ok || !id) return null;
      const plan: ProductionPlan = {
        id: uid("plan_"),
        name: name.trim() || `Plan ${get().plans.length + 1}`,
        createdAt: Date.now(),
        status: "draft",
        request: st.lastRequest,
        result: st.lastResult,
        notes,
      };
      set((s) => ({ plans: [plan, ...s.plans] }));
      persist(() => db().plans.put({ key: scopedKey(id, plan.id), projectId: id, data: plan }));
      return plan;
    },

    deletePlan(planId) {
      const id = pid();
      set((s) => ({ plans: s.plans.filter((p) => p.id !== planId) }));
      persist(() => db().plans.delete(scopedKey(id, planId)));
    },

    renamePlan(planId, name) {
      const id = pid();
      const p = get().plans.find((x) => x.id === planId);
      if (!p || !name.trim()) return;
      const next = { ...p, name: name.trim() };
      set((s) => ({ plans: s.plans.map((x) => (x.id === planId ? next : x)) }));
      persist(() => db().plans.put({ key: scopedKey(id, planId), projectId: id, data: next }));
    },

    commitPlan(planId) {
      const id = pid();
      const plan = get().plans.find((p) => p.id === planId);
      if (!plan) return { ok: false, message: "Plan not found." };
      const out = commitPlanCore(plan, get().remnants);
      if (!out.ok) return { ok: false, message: out.reason };
      set((s) => ({ remnants: out.remnants, plans: s.plans.map((p) => (p.id === planId ? out.plan : p)) }));
      const d = db();
      persist(() =>
        d.transaction("rw", [d.remnants, d.plans], async () => {
          await d.remnants.bulkPut(out.remnants.map((r) => ({ key: scopedKey(id, r.id), projectId: id, data: r })));
          await d.plans.put({ key: scopedKey(id, planId), projectId: id, data: out.plan });
        }),
      );
      patchProject({});
      const pieces = out.consumption.reduce((s, c) => s + c.pieces, 0);
      return { ok: true, message: `Committed. ${pieces} material piece${pieces === 1 ? "" : "s"} deducted from inventory.` };
    },

    buildRequest() {
      const s = get();
      if (!s.project) return null;
      const st = settingsOf(s);
      const excluded = new Set(st.excludedRemnants);
      return {
        remnants: s.remnants.filter((r) => !excluded.has(r.id)),
        products: s.products,
        demand: s.products.map((p) => ({ productId: p.id, max: st.demand[p.id]?.max ?? 0, priority: st.demand[p.id]?.priority ?? false })).filter((d) => d.max > 0),
        constraints: st.constraints,
        objective: st.objective,
        algorithm: st.algorithm,
        heuristic: st.heuristic,
        search: st.search,
      };
    },

    exportProject() {
      const s = get();
      return JSON.stringify(
        {
          format: PROJECT_FORMAT,
          version: PROJECT_VERSION,
          exportedAt: Date.now(),
          project: { id: s.project?.id ?? "", name: s.project?.name ?? "REFORM project" },
          settings: s.project?.settings ? { ...s.project.settings, lastResult: null, previousResult: null, baselineResult: null, lastRequest: null } : null,
          remnants: s.remnants,
          products: s.products,
          plans: s.plans,
        },
        null,
        2,
      );
    },

    async importProject(text) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return { ok: false, message: "The file is not valid JSON." };
      }
      const parsed = projectFileSchema.safeParse(json);
      if (!parsed.success) return { ok: false, message: `Invalid REFORM project: ${formatZodError(parsed.error)}` };
      const f = parsed.data;
      const id = uid("prj_");
      const now = Date.now();
      const rawSettings = (json as { settings?: Partial<ProjectSettings> }).settings ?? {};
      const settings: ProjectSettings = { ...DEFAULT_SETTINGS(), ...rawSettings, lastResult: null, previousResult: null, baselineResult: null, lastRequest: null };
      const row: ProjectRow = { id, name: `${f.project.name} (imported)`, createdAt: now, updatedAt: now, kind: "custom", settings };
      const d = db();
      await d.transaction("rw", [d.projects, d.remnants, d.products, d.plans], async () => {
        await d.projects.put(row);
        await d.remnants.bulkPut(f.remnants.map((r) => ({ key: scopedKey(id, r.id), projectId: id, data: r as MaterialRemnant })));
        await d.products.bulkPut(f.products.map((p) => ({ key: scopedKey(id, p.id), projectId: id, data: p as ProductTemplate })));
        await d.plans.bulkPut(f.plans.map((p) => ({ key: scopedKey(id, p.id), projectId: id, data: p as unknown as ProductionPlan })));
      });
      set((s) => ({ projects: [row, ...s.projects] }));
      await loadProject(id);
      return { ok: true, message: `Imported "${f.project.name}" with ${f.remnants.length} materials and ${f.products.length} products as a new workspace.` };
    },
  };
});

/** Selectors */
export const useSettings = () => useWorkspace((s) => s.project?.settings ?? null);

export function currentHash(s: WorkspaceStore): string | null {
  const req = s.buildRequest();
  return req ? requestHash(req) : null;
}
