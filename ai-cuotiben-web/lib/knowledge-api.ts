import { apiFetch, API_BASE, Profile } from "./api";

export interface SyncStatus {
  vault_configured: boolean;
  vault_path: string | null;
  questions_total: number;
  questions_synced: number;
  knowledge_points_total: number;
  knowledge_points_synced: number;
  last_sync: string | null;
  pending: number;
}

export interface InitVaultResult {
  questions: number;
  knowledge_points: number;
  errors: string[];
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const res = await apiFetch<{ status: string; data: SyncStatus }>(
    `${API_BASE}/api/knowledge/status`
  );
  return res.data;
}

export async function initVault(overwrite = false): Promise<InitVaultResult> {
  const res = await apiFetch<{ status: string; data: InitVaultResult }>(
    `${API_BASE}/api/knowledge/init-vault`,
    {
      method: "POST",
      body: JSON.stringify({ overwrite }),
    }
  );
  return res.data;
}

export async function exportMarkdown(subjectId?: number): Promise<Blob> {
  const params = subjectId ? `?subject_id=${subjectId}` : "";
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/api/knowledge/export-markdown${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("导出失败");
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
