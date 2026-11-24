"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Command, Database, Factory, FilePlus2, GraduationCap, Loader2, Moon, PanelLeftClose, PanelLeftOpen, RotateCcw, Search, Sun, X } from "lucide-react";
import { useWorkspace, DEMO_PROJECT_ID } from "@/stores/workspace";
import { cn } from "@/lib/id";
import { Button, Kbd } from "@/components/ui/primitives";
import { NAV } from "./nav";
import { LogoMark } from "./Logo";
import { JUDGE_STEPS } from "./judge";

function useApplyTheme() {
  const theme = useWorkspace((s) => s.prefs.theme);
  const rm = useWorkspace((s) => s.prefs.reducedMotion);
  useEffect(() => {
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    try {
      localStorage.setItem("reform-theme", JSON.stringify(theme));
    } catch {}
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", rm === "reduce");
  }, [rm]);
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const init = useWorkspace((s) => s.init);
  const hydrated = useWorkspace((s) => s.hydrated);
  const project = useWorkspace((s) => s.project);
  const dbError = useWorkspace((s) => s.dbError);
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  useApplyTheme();

  useEffect(() => {
    void init();
  }, [init]);

  // Warn before closing/reloading while an IndexedDB write is still in flight.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (useWorkspace.getState().pending > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!hydrated)
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-muted text-[13px]" role="status">
        <Loader2 className="animate-spin" size={16} /> Opening local workspace…
      </div>
    );

  if (!project) return <Onboarding error={dbError} />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onPalette={() => setPalette(true)} />
        <main id="main" className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <JudgeGuide />
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const path = usePathname();
  const groups = ["Operate", "Analyse", "System"] as const;
  return (
    <nav aria-label="Workspace" className={cn("hidden md:flex flex-col shrink-0 border-r border-line bg-surface transition-[width] duration-200", collapsed ? "w-[56px]" : "w-[212px]")}>
      <div className={cn("flex h-12 items-center border-b border-line", collapsed ? "justify-center" : "px-4 justify-between")}>
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-[0.18em] text-[12.5px]" aria-label="REFORM home">
          <LogoMark />
          {!collapsed && "REFORM"}
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-3 scroll-thin">
        {groups.map((g) => (
          <div key={g} className="mb-3">
            {!collapsed && <div className="label-caps px-4 mb-1">{g}</div>}
            {NAV.filter((n) => n.group === g).map((n) => {
              const active = n.href === "/workspace" ? path === n.href : path.startsWith(n.href);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  title={collapsed ? n.label : n.hint}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative mx-2 flex h-8 items-center gap-2.5 rounded-[3px] text-[13px] transition-colors",
                    collapsed ? "justify-center" : "px-2.5",
                    active ? "bg-ink text-bg" : "text-ink/75 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon size={15} strokeWidth={1.75} />
                  {!collapsed && <span>{n.label}</span>}
                  {active && !collapsed && <span className="absolute right-2 h-1.5 w-1.5 bg-accent" />}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <button onClick={onToggle} className="flex h-10 items-center justify-center gap-2 border-t border-line text-muted hover:text-ink text-[12px]" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
        {collapsed ? <PanelLeftOpen size={15} /> : <><PanelLeftClose size={15} /> Collapse <Kbd>⌘\</Kbd></>}
      </button>
    </nav>
  );
}

function PersistenceIndicator() {
  const pending = useWorkspace((s) => s.pending);
  const err = useWorkspace((s) => s.dbError);
  if (err)
    return (
      <span className="flex items-center gap-1.5 text-[11.5px] text-err" title={err}>
        <Database size={13} /> Storage error
      </span>
    );
  return (
    <span className="hidden sm:flex items-center gap-1.5 text-[11.5px] text-muted" title="All data is stored in this browser (IndexedDB). Nothing is sent to a server.">
      <span className={cn("h-1.5 w-1.5", pending > 0 ? "bg-warn animate-pulse" : "bg-primary")} />
      {pending > 0 ? "Saving…" : "Saved locally"}
    </span>
  );
}

function ProjectSwitcher() {
  const projects = useWorkspace((s) => s.projects);
  const project = useWorkspace((s) => s.project);
  const switchProject = useWorkspace((s) => s.switchProject);
  const createProject = useWorkspace((s) => s.createProject);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="flex h-8 items-center gap-2 rounded-[3px] border border-line px-2.5 text-[12.5px] hover:bg-surface-2 max-w-[220px]">
        {project?.kind === "demo" ? <Factory size={13} className="text-primary shrink-0" /> : <Database size={13} className="shrink-0" />}
        <span className="truncate font-medium">{project?.name}</span>
        <ChevronDown size={13} className="text-muted shrink-0" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-9 z-40 w-64 border border-line-strong bg-surface rounded-[3px] shadow-lg py-1">
          <div className="label-caps px-3 py-1.5">Workspaces</div>
          {projects.map((p) => (
            <button
              role="menuitem"
              key={p.id}
              onClick={() => {
                void switchProject(p.id);
                setOpen(false);
              }}
              className={cn("flex w-full items-center gap-2 px-3 h-8 text-left text-[13px] hover:bg-surface-2", p.id === project?.id && "font-semibold")}
            >
              {p.kind === "demo" ? <Factory size={13} /> : <Database size={13} />}
              <span className="truncate flex-1">{p.name}</span>
              {p.id === project?.id && <span className="h-1.5 w-1.5 bg-accent" />}
            </button>
          ))}
          <div className="border-t border-line my-1" />
          <button role="menuitem" className="flex w-full items-center gap-2 px-3 h-8 text-[13px] hover:bg-surface-2" onClick={() => { void createProject("empty"); setOpen(false); toast.success("Created an empty workspace with the built-in pattern library."); }}>
            <FilePlus2 size={13} /> New empty workspace
          </button>
          {!projects.some((p) => p.id === DEMO_PROJECT_ID) && (
            <button role="menuitem" className="flex w-full items-center gap-2 px-3 h-8 text-[13px] hover:bg-surface-2" onClick={() => { void createProject("demo"); setOpen(false); }}>
              <Factory size={13} /> Open demonstration factory
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TopBar({ onPalette }: { onPalette: () => void }) {
  const path = usePathname();
  const prefs = useWorkspace((s) => s.prefs);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const project = useWorkspace((s) => s.project);
  const resetDemo = useWorkspace((s) => s.resetDemo);
  const current = NAV.find((n) => (n.href === "/workspace" ? path === n.href : path.startsWith(n.href)));
  const dark = prefs.theme === "dark";
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 md:px-4">
      <Link href="/" className="md:hidden" aria-label="Home">
        <LogoMark />
      </Link>
      <ProjectSwitcher />
      <nav aria-label="Breadcrumb" className="hidden lg:flex items-center gap-1.5 text-[12.5px] text-muted">
        <ChevronRight size={13} />
        <Link href="/workspace" className="hover:text-ink">Workspace</Link>
        {current && current.href !== "/workspace" && (
          <>
            <ChevronRight size={13} />
            <span className="text-ink font-medium" aria-current="page">{current.label}</span>
          </>
        )}
      </nav>
      <div className="flex-1" />
      <PersistenceIndicator />
      {project?.kind === "demo" && (
        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={async () => { if (confirm("Reset the demonstration factory? This restores the original synthetic inventory and removes demo plans.")) { await resetDemo(); toast.success("Demonstration factory reset."); } }} title="Restore the original demo dataset">
          <span className="hidden xl:inline">Reset demo</span>
        </Button>
      )}
      <Button size="sm" variant={prefs.judgeMode ? "primary" : "ghost"} icon={<GraduationCap size={14} />} onClick={() => setPrefs({ judgeMode: !prefs.judgeMode })} aria-pressed={prefs.judgeMode}>
        <span className="hidden xl:inline">Judge guide</span>
      </Button>
      <button onClick={onPalette} className="hidden sm:flex h-8 items-center gap-2 rounded-[3px] border border-line px-2.5 text-[12.5px] text-muted hover:text-ink hover:bg-surface-2" aria-label="Open command palette">
        <Search size={13} /> <span className="hidden lg:inline">Commands</span> <Kbd>⌘K</Kbd>
      </button>
      <button onClick={() => setPrefs({ theme: dark ? "light" : "dark" })} className="flex h-8 w-8 items-center justify-center rounded-[3px] text-muted hover:text-ink hover:bg-surface-2" aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"}>
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <MobileNav />
    </header>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="md:hidden">
      <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>Menu</Button>
      {open && (
        <div className="fixed inset-x-0 top-12 z-40 border-b border-line bg-surface p-2 grid grid-cols-2 gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="flex items-center gap-2 h-9 px-3 rounded-[3px] text-[13px] hover:bg-surface-2">
              <n.icon size={14} /> {n.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const st = useWorkspace();
  const commands: Cmd[] = useMemo(
    () => [
      ...NAV.map((n) => ({ id: n.href, label: `Go to ${n.label}`, hint: n.hint, run: () => router.push(n.href) })),
      { id: "run", label: "Run optimization", hint: "Optimizer · R", run: () => router.push("/workspace/optimizer?run=1") },
      { id: "add", label: "Add material", hint: "Inventory", run: () => router.push("/workspace/inventory?new=1") },
      { id: "newprod", label: "Create custom product", hint: "Products", run: () => router.push("/workspace/products?new=1") },
      { id: "demo", label: "Open demonstration factory", hint: "Workspace", run: () => void st.createProject("demo").then(() => router.push("/workspace")) },
      { id: "theme", label: "Toggle light / dark appearance", run: () => st.setPrefs({ theme: st.prefs.theme === "dark" ? "light" : "dark" }) },
      { id: "judge", label: "Toggle judge guide", run: () => st.setPrefs({ judgeMode: !st.prefs.judgeMode }) },
      { id: "method", label: "Open methodology", run: () => router.push("/methodology") },
    ],
    [router, st],
  );
  const filtered = commands.filter((c) => (c.label + " " + (c.hint ?? "")).toLowerCase().includes(q.toLowerCase()));
  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);
  const exec = useCallback((c: Cmd | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  }, [onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 bg-ink/30 flex items-start justify-center pt-[14vh] px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div role="dialog" aria-label="Command palette" className="w-full max-w-lg border border-line-strong bg-surface rounded-[3px] shadow-2xl" initial={{ y: -8 }} animate={{ y: 0 }}>
            <div className="flex items-center gap-2 border-b border-line px-3 h-11">
              <Command size={14} className="text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => { setQ(e.target.value); setIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onClose();
                  if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
                  if (e.key === "Enter") exec(filtered[idx]);
                }}
                placeholder="Type a command…"
                aria-label="Command"
                className="flex-1 bg-transparent text-[14px] outline-none"
              />
              <Kbd>esc</Kbd>
            </div>
            <ul className="max-h-80 overflow-y-auto py-1 scroll-thin" role="listbox">
              {filtered.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No matching command</li>}
              {filtered.map((c, i) => (
                <li key={c.id} role="option" aria-selected={i === idx}>
                  <button onMouseEnter={() => setIdx(i)} onClick={() => exec(c)} className={cn("flex w-full items-center justify-between px-3 h-9 text-[13px] text-left", i === idx && "bg-surface-2")}>
                    <span>{c.label}</span>
                    {c.hint && <span className="text-[11.5px] text-muted">{c.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function JudgeGuide() {
  const prefs = useWorkspace((s) => s.prefs);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const router = useRouter();
  const path = usePathname();
  if (!prefs.judgeMode) return null;
  const i = Math.min(prefs.judgeStep, JUDGE_STEPS.length - 1);
  const step = JUDGE_STEPS[i];
  const here = path === step.href;
  return (
    <motion.aside initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} aria-label="Judge guide" className="fixed bottom-4 left-4 z-40 w-[340px] border border-ink bg-ink text-bg rounded-[3px] shadow-2xl">
      <div className="flex items-center justify-between px-3 h-9 border-b border-bg/15">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent">Judge guide · {i + 1}/{JUDGE_STEPS.length}</span>
        <button aria-label="Close judge guide" onClick={() => setPrefs({ judgeMode: false })} className="text-bg/60 hover:text-bg">
          <X size={14} />
        </button>
      </div>
      <div className="p-3">
        <h3 className="text-[14px] font-semibold mb-1">{step.title}</h3>
        <p className="text-[12.5px] leading-relaxed text-bg/80">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button disabled={i === 0} onClick={() => setPrefs({ judgeStep: i - 1 })} className="flex items-center gap-1 text-[12px] text-bg/70 hover:text-bg disabled:opacity-30">
            <ChevronLeft size={13} /> Back
          </button>
          <div className="flex gap-2">
            {!here && (
              <button onClick={() => router.push(step.href)} className="h-7 px-2.5 border border-bg/30 rounded-[3px] text-[12px] hover:bg-bg/10">
                Open page
              </button>
            )}
            {i < JUDGE_STEPS.length - 1 ? (
              <button onClick={() => { setPrefs({ judgeStep: i + 1 }); if (JUDGE_STEPS[i + 1].href !== path) router.push(JUDGE_STEPS[i + 1].href); }} className="h-7 px-2.5 bg-accent text-accent-ink rounded-[3px] text-[12px] font-medium flex items-center gap-1">
                Next <ChevronRight size={13} />
              </button>
            ) : (
              <button onClick={() => setPrefs({ judgeMode: false, judgeStep: 0 })} className="h-7 px-2.5 bg-accent text-accent-ink rounded-[3px] text-[12px] font-medium">
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-0.5 px-3 pb-3">
        {JUDGE_STEPS.map((_, k) => (
          <button key={k} aria-label={`Step ${k + 1}`} onClick={() => setPrefs({ judgeStep: k })} className={cn("h-1 flex-1", k <= i ? "bg-accent" : "bg-bg/20")} />
        ))}
      </div>
    </motion.aside>
  );
}

function Onboarding({ error }: { error: string | null }) {
  const createProject = useWorkspace((s) => s.createProject);
  const setPrefs = useWorkspace((s) => s.setPrefs);
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (kind: "demo" | "empty") => {
    setBusy(kind);
    try {
      await createProject(kind);
      if (kind === "demo") setPrefs({ judgeMode: true, judgeStep: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the workspace.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="min-h-screen tech-grid-lg flex items-center justify-center p-6">
      <div className="w-full max-w-3xl border border-line-strong bg-surface rounded-[3px]">
        <div className="border-b border-line px-6 py-5 flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold tracking-[0.18em] text-[13px]"><LogoMark /> REFORM</span>
          <span className="label-caps">First launch · local workspace</span>
        </div>
        <div className="px-6 pt-6">
          <h1 className="text-[24px] font-semibold tracking-tight">How would you like to begin?</h1>
          <p className="text-[13.5px] text-muted mt-1">Everything runs and is stored in this browser. No account, no server, no API keys.</p>
          {error && <p className="mt-3 text-[12.5px] text-err">Local storage problem: {error}. Private browsing modes may block IndexedDB.</p>}
        </div>
        <div className="grid md:grid-cols-2 gap-4 p-6">
          <button onClick={() => go("demo")} disabled={!!busy} className="group text-left border border-ink bg-ink text-bg rounded-[3px] p-5 hover:brightness-110 disabled:opacity-60">
            <div className="flex items-center justify-between">
              <Factory size={20} className="text-accent" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent">Recommended for judges</span>
            </div>
            <h2 className="mt-6 text-[17px] font-semibold">Explore the demonstration factory</h2>
            <p className="mt-1 text-[12.5px] text-bg/75">A synthetic workshop with 41 fabric remnants, defects, a rotation-restricted print and 8 product patterns. Opens with a guided walkthrough.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-accent">{busy === "demo" ? <Loader2 size={13} className="animate-spin" /> : null} Load demo <ChevronRight size={13} /></span>
          </button>
          <button onClick={() => go("empty")} disabled={!!busy} className="text-left border border-line-strong rounded-[3px] p-5 hover:bg-surface-2 disabled:opacity-60">
            <FilePlus2 size={20} className="text-primary" />
            <h2 className="mt-6 text-[17px] font-semibold">Start with an empty workspace</h2>
            <p className="mt-1 text-[12.5px] text-muted">No inventory. The built-in illustrative pattern library is included so you can add your own remnants and optimize immediately.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-primary">{busy === "empty" ? <Loader2 size={13} className="animate-spin" /> : null} Start empty <ChevronRight size={13} /></span>
          </button>
        </div>
      </div>
    </div>
  );
}
