import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/Shell";

export const metadata: Metadata = { title: "Workspace — REFORM" };

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
