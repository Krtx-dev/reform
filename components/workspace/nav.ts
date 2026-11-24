import { Scissors, Boxes, ClipboardList, FlaskConical, LayoutGrid, Leaf, ScanLine, Settings, Shapes, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Operate" | "Analyse" | "System";
  hint: string;
}

export const NAV: NavItem[] = [
  { href: "/workspace", label: "Overview", icon: LayoutGrid, group: "Operate", hint: "Operational overview" },
  { href: "/workspace/inventory", label: "Inventory", icon: Boxes, group: "Operate", hint: "Material library" },
  { href: "/workspace/scanner", label: "Scanner", icon: ScanLine, group: "Operate", hint: "Digitize remnants from photos" },
  { href: "/workspace/products", label: "Products", icon: Shapes, group: "Operate", hint: "Pattern library" },
  { href: "/workspace/optimizer", label: "Optimizer", icon: Scissors, group: "Operate", hint: "Manufacturing studio" },
  { href: "/workspace/plans", label: "Plans", icon: ClipboardList, group: "Operate", hint: "Production plans" },
  { href: "/workspace/impact", label: "Impact", icon: Leaf, group: "Analyse", hint: "Recovery analytics" },
  { href: "/workspace/benchmark", label: "Benchmark", icon: FlaskConical, group: "Analyse", hint: "Algorithm laboratory" },
  { href: "/workspace/settings", label: "Settings", icon: Settings, group: "System", hint: "Preferences and data" },
];
