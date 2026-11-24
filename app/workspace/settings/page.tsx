"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { useWorkspace } from "@/stores/workspace";
import { downloadText } from "@/lib/id";
import { Button, Dialog, Field, Input, PageHeader, Panel, Segmented, Select } from "@/components/ui/primitives";

export default function SettingsPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState(ws.project?.name ?? "");
  const [confirm, setConfirm] = useState<null | "delete" | "clear">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mx-auto max-w-[900px] p-4 md:p-8">
      <PageHeader eyebrow="System" title="Settings" description="Preferences and data management. All data lives in this browser's IndexedDB; nothing is uploaded." />
      <div className="flex flex-col gap-6">
        <Panel title="Preferences">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Display units" htmlFor="unit" hint="Storage is always integer millimetres.">
              <Segmented label="Display units" value={ws.prefs.unit} onChange={(u) => ws.setPrefs({ unit: u })} options={[{ value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "m", label: "m" }]} />
            </Field>
            <Field label="Appearance" htmlFor="theme">
              <Segmented label="Appearance" value={ws.prefs.theme} onChange={(t) => ws.setPrefs({ theme: t })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]} />
            </Field>
            <Field label="Currency symbol" htmlFor="cur">
              <Select id="cur" value={ws.prefs.currency} onChange={(e) => ws.setPrefs({ currency: e.target.value })}>
                {["€", "$", "£", "₹", "¥", "CHF "].map((c) => <option key={c} value={c}>{c.trim()}</option>)}
              </Select>
            </Field>
            <Field label="Motion" htmlFor="motion" hint="System follows your OS reduced-motion setting.">
              <Segmented label="Motion" value={ws.prefs.reducedMotion} onChange={(v) => ws.setPrefs({ reducedMotion: v })} options={[{ value: "system", label: "System" }, { value: "reduce", label: "Reduce" }]} />
            </Field>
          </div>
        </Panel>
        <Panel title="Workspace">
          <div className="flex items-end gap-2">
            <Field className="flex-1" label="Workspace name" htmlFor="pname"><Input id="pname" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Button onClick={() => { ws.renameProject(name); toast.success("Renamed."); }}>Rename</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={<Download size={14} />} onClick={() => downloadText(`reform-project.json`, ws.exportProject(), "application/json")}>Export project JSON</Button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" aria-label="Project JSON" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const r = await ws.importProject(await f.text()); if (r.ok) toast.success(r.message); else toast.error(r.message); }} />
            <Button icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Import project JSON</Button>
            <Button icon={<RotateCcw size={14} />} onClick={async () => { await ws.resetDemo(); toast.success("Demonstration factory restored."); router.push("/workspace"); }}>Load / reset demo factory</Button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">Imported projects are validated before anything is written and are added as a new workspace; the current workspace is never overwritten.</p>
        </Panel>
        <Panel title="Danger zone">
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirm("delete")}>Delete this workspace</Button>
            <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirm("clear")}>Erase all local data</Button>
          </div>
        </Panel>
      </div>
      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === "clear" ? "Erase all local data" : "Delete workspace"}
        footer={<><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" onClick={async () => { if (confirm === "clear") await ws.clearAllData(); else if (ws.project) await ws.deleteProject(ws.project.id); setConfirm(null); toast.success("Done."); }}>Confirm</Button></>}
      >
        <p className="text-[13px]">{confirm === "clear" ? "Every workspace, material, product, plan and preference stored in this browser will be permanently erased." : `“${ws.project?.name}” and all its materials, products and plans will be permanently deleted.`} This cannot be undone. Export a project JSON first if you need a copy.</p>
      </Dialog>
    </div>
  );
}
