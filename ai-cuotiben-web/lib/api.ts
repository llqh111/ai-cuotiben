"use client";
// 前端统一 API 客户端：注入 JWT、解析后端 {status,data} 信封、集中处理 401。
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

const TOKEN_KEY = "cuotiben_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ApiEnvelope<T> {
  status: string;
  data?: T;
  message?: string;
  detail?: string;
}

// 核心请求：自动带 token；后端用 HTTPException 返回 {detail}，成功返回 {status,data}。
export async function apiFetch<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const isForm = opts.body instanceof FormData;
  if (opts.body && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (res.status === 401) {
    clearToken();
    throw new ApiError(json.detail ?? "登录已过期，请重新登录", 401);
  }
  if (!res.ok || json.status === "error") {
    throw new ApiError(
      json.detail ?? json.message ?? `请求失败 (${res.status})`,
      res.status,
    );
  }
  return json.data as T;
}

// ---- 鉴权 ----

export interface AuthResult {
  token: string;
  user_id: number;
  nickname: string;
}

export async function authenticate(
  mode: "register" | "login",
  nickname: string,
  passphrase: string,
): Promise<AuthResult> {
  const data = await apiFetch<AuthResult>(`/api/auth/${mode}`, {
    method: "POST",
    body: JSON.stringify({ nickname, passphrase }),
  });
  setToken(data.token);
  return data;
}

// ---- 上传 ----

export interface UploadItem {
  id: number;
  status: string;
  question_content?: string;
}

export interface UploadResult {
  questions: UploadItem[];
  total: number;
}

export async function uploadQuestion(file: File, subjectId?: number): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  const url = subjectId ? `/api/upload/?subject_id=${subjectId}` : "/api/upload/";
  return apiFetch<UploadResult>(url, { method: "POST", body: fd });
}

export async function uploadText(text: string, subjectId: number): Promise<UploadResult> {
  return apiFetch<UploadResult>("/api/upload/text", {
    method: "POST",
    body: JSON.stringify({ text, subject_id: subjectId }),
  });
}

// ---- 科目（后端 seed 顺序固定，前端按 id 映射名称）----

export interface SubjectMeta {
  id: number;
  name: string;
}

export const SUBJECTS: SubjectMeta[] = [
  { id: 1, name: "语文" },
  { id: 2, name: "数学" },
  { id: 3, name: "英语" },
  { id: 4, name: "物理" },
  { id: 5, name: "化学" },
  { id: 6, name: "生物" },
];

export function subjectName(id: number | string): string {
  const n = Number(id);
  return SUBJECTS.find((s) => s.id === n)?.name ?? String(id);
}

// ---- 用户资料（驱动倒计时 + 冲刺）----

export interface Profile {
  user_id: number;
  nickname: string;
  exam_date: string | null;
  theme_preference: string | null;
  subject_prefs: string;  // "1,2,3,4,5,6" 逗号分隔的 enabled subject IDs
}

export function getProfile(): Promise<Profile> {
  return apiFetch<Profile>("/api/auth/me");
}

export function updateProfile(body: {
  exam_date?: string;
  theme_preference?: string;
  subject_prefs?: string;
}): Promise<Profile> {
  return apiFetch<Profile>("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ---- 统计 ----

export interface TrendPoint {
  date: string;
  new: number;
  mastered: number;
}

export function getTrends(days = 30): Promise<TrendPoint[]> {
  return apiFetch<TrendPoint[]>(`/api/stats/trends?days=${days}`);
}

export function getStreak(): Promise<{ streak: number }> {
  return apiFetch<{ streak: number }>("/api/stats/streak");
}

export function getDailyCompletion(): Promise<{
  due_total: number;
  completed: number;
  rate: number;
}> {
  return apiFetch("/api/stats/daily-completion");
}

export interface WeakPoint {
  knowledge_point: string;
  count: number;
  mastery_rate?: number;
}

export function getWeakPoints(): Promise<WeakPoint[]> {
  return apiFetch<WeakPoint[]>("/api/stats/weak-points");
}

export interface LearningReport {
  period: string;
  span_days: number;
  start: string;
  end: string;
  new_questions: number;
  mastered: number;
  reviews: number;
  accuracy: number;
  weak_points: WeakPoint[];
}

export function getReport(period: "week" | "month" = "week"): Promise<LearningReport> {
  return apiFetch<LearningReport>(`/api/stats/report?period=${period}`);
}

// ---- 考前冲刺 ----

export interface SprintQuestion {
  id: number;
  subject_id: number;
  question_content: string | null;
  question_type: string;
  correct_answer: string | null;
  solution_steps: string | null;
  mastery_level: string;
}

export interface SprintPlan {
  days_remaining: number;
  phase: string;
  daily_quota: number;
  unmastered_total: number;
  exam_date: string | null;
  questions: SprintQuestion[];
}

export function getSprintPlan(): Promise<SprintPlan> {
  return apiFetch<SprintPlan>("/api/sprint/plan");
}

// ---- AI 相似题 ----

export interface PracticeQuestion {
  id: number;
  source_question_id: number;
  content: string;
  answer: string | null;
  solution: string | null;
  user_result: string;
}

export function listSimilar(questionId: number | string): Promise<PracticeQuestion[]> {
  return apiFetch<PracticeQuestion[]>(`/api/generate/similar/${questionId}`);
}

export function generateSimilar(questionId: number | string): Promise<PracticeQuestion[]> {
  return apiFetch<PracticeQuestion[]>(`/api/generate/similar/${questionId}`, {
    method: "POST",
  });
}

// ---- 知识图谱 ----

export interface GraphNode {
  id: number;
  name: string;
  symbolSize: number;
  count: number;
  itemStyle?: { color: string };
}

export interface GraphEdge {
  source: string;
  target: string;
  relation_type?: string;
}

export function getGraph(subjectId: number | string): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  return apiFetch(`/api/graph/${subjectId}`);
}

export function rebuildGraph(subjectId: number | string): Promise<{ relations_built: number }> {
  return apiFetch(`/api/graph/${subjectId}/rebuild`, { method: "POST" });
}

// ---- PDF 导出（二进制，单独处理，不能走 apiFetch 的 JSON 解析）----

export interface ExportOptions {
  subject_id?: number;
  knowledge_point_id?: number;
  question_pattern_id?: number;
  mastery_level?: string;
  with_answer?: boolean;
  title?: string;
}

export async function downloadPdf(opts: ExportOptions): Promise<void> {
  const token = getToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/api/export/pdf`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts),
  });
  if (res.status === 401) {
    clearToken();
    throw new ApiError("登录已过期，请重新登录", 401);
  }
  if (!res.ok) throw new ApiError(`导出失败 (${res.status})`, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.title ?? "错题导出"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- 鉴权守卫：无 token 跳登录 ----

export function useAuthGuard(): void {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);
}

export function logout(router: { replace: (p: string) => void }): void {
  clearToken();
  router.replace("/login");
}
