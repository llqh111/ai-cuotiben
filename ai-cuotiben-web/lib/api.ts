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

// Render 免费版休眠后冷启动可达 ~50s，给请求留足超时（默认 90s）。
const DEFAULT_TIMEOUT_MS = 90_000;

let warmedUp = false;

// 预热后端：唤醒休眠的 Render 实例。打开页面时调用，等用户真正操作时后端已就绪。
export async function warmupBackend(): Promise<void> {
  if (warmedUp) return;
  try {
    await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    warmedUp = true;
  } catch {
    // 预热失败不影响后续真实请求，忽略
  }
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

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers,
      signal: opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (e) {
    // 超时 / 断网 → 给出可操作的提示，而非笼统的"网络异常"
    const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
    throw new ApiError(
      isTimeout
        ? "服务器启动中或响应较慢，请稍等约 1 分钟后重试（免费服务器休眠唤醒需要时间）"
        : "无法连接服务器，请检查网络后重试",
      0,
    );
  }
  warmedUp = true;
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
  image_url?: string;
}

export interface UploadResult {
  questions: UploadItem[];
  total: number;
  image_url?: string;
}

export interface OcrDoneResult {
  ocr_text: string;
  image_url: string;
  student_answer: string;
  subject_id: number;
}

// 小题上传：OCR图(必传) + 展示配图(可选)，Gemini 自动 OCR
export async function uploadSmallQuestion(
  ocrImage: File,
  displayImage: File | null,
  subjectId?: number,
  confirmFirst = false,
): Promise<UploadResult | OcrDoneResult> {
  const fd = new FormData();
  fd.append("ocr_image", ocrImage);
  if (displayImage) fd.append("display_image", displayImage);
  if (subjectId != null) fd.append("subject_id", String(subjectId));
  fd.append("confirm_first", String(confirmFirst));
  return apiFetch<UploadResult | OcrDoneResult>("/api/upload/small", { method: "POST", body: fd });
}

// 大题上传：题目图(必传) + 外部AI文本(必传)，不自动 OCR
export async function uploadBigQuestion(
  image: File,
  text: string,
  subjectId?: number,
): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("image", image);
  fd.append("text", text);
  if (subjectId) fd.append("subject_id", String(subjectId));
  return apiFetch<UploadResult>("/api/upload/big-question", { method: "POST", body: fd });
}

export async function uploadText(text: string, subjectId: number, image?: File | null): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("text", text);
  fd.append("subject_id", String(subjectId));
  if (image) fd.append("image", image);
  return apiFetch<UploadResult>("/api/upload/text", {
    method: "POST",
    body: fd,
  });
}

// OCR 确认后提交修正文本，触发 DeepSeek 分析
export function confirmUpload(body: {
  ocr_text: string;
  image_url: string;
  student_answer: string;
  subject_id: number;
}): Promise<UploadResult> {
  return apiFetch<UploadResult>("/api/upload/confirm", {
    method: "POST",
    body: JSON.stringify(body),
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

export interface ErrorCategoryItem {
  category: string;
  label: string;
  count: number;
  pct: number;
}

export interface ErrorCategoriesData {
  total: number;
  categories: ErrorCategoryItem[];
}

export function getErrorCategories(): Promise<ErrorCategoriesData> {
  return apiFetch<ErrorCategoriesData>("/api/stats/error-categories");
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

// ── PDF 上传 ──

export interface PdfQuestion {
  index: number;
  question_content: string;
  question_type: string;
  correct_answer: string;
  solution_steps: string;
  knowledge_point_name: string;
  question_pattern_name: string;
  selected?: boolean;
}

export interface PdfAnalysisResult {
  filename: string;
  subject_id: number;
  subject_name: string;
  total_count: number;
  questions: PdfQuestion[];
}

export async function uploadPdf(file: File, subjectId: number): Promise<PdfAnalysisResult> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  form.append("subject_id", String(subjectId));
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/api/upload/pdf`, {
    method: "POST",
    headers,
    body: form,
  });
  if (res.status === 401) { clearToken(); throw new ApiError("登录已过期", 401); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "上传失败" }));
    throw new ApiError(err.detail || "上传失败", res.status);
  }
  const json = await res.json();
  return json.data;
}

export async function confirmPdfQuestions(
  subjectId: number,
  questions: PdfQuestion[]
): Promise<{ saved_count: number; saved_ids: number[]; first_question_id: number | null }> {
  return apiFetch("/api/upload/pdf/confirm", {
    method: "POST",
    body: JSON.stringify({ subject_id: subjectId, questions }),
  });
}

export async function batchQuestions(action: "delete" | "master", ids: number[]): Promise<{ message: string; count: number }> {
  return apiFetch("/api/questions/batch", {
    method: "POST",
    body: JSON.stringify({ action, ids }),
  });
}

// ── 统计仪表盘 ──

export interface StatsOverview {
  total: number;
  mastered: number;
  learning: number;
  new: number;
  mastery_rate: number;
}

export interface SubjectStat {
  id: number;
  name: string;
  icon: string;
  color: string;
  total: number;
  mastered: number;
  learning: number;
  new: number;
}

export interface DailyReview {
  due_total: number;
  completed: number;
  rate: number;
  streak: number;
}

export async function getStatsOverview(): Promise<StatsOverview> {
  return apiFetch<StatsOverview>("/api/stats/overview");
}

export async function getStatsSubjects(): Promise<SubjectStat[]> {
  return apiFetch<SubjectStat[]>("/api/stats/subjects");
}

export async function getStatsTrends(days: number = 30): Promise<TrendPoint[]> {
  return apiFetch<TrendPoint[]>(`/api/stats/trends?days=${days}`);
}

export async function getStatsWeakPoints(): Promise<WeakPoint[]> {
  return apiFetch<WeakPoint[]>("/api/stats/weak-points");
}

export async function getStatsDailyReview(): Promise<DailyReview> {
  return apiFetch<DailyReview>("/api/stats/daily-completion");
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

// ── 章节进度追踪 ──

export interface ChapterNode {
  id: number;
  name: string;
  parent_id: number | null;
  subject_id: number;
  sort_order: number;
  description: string | null;
  mastery_rating: number | null;
  error_count: number;
  reviewed_at: string | null;
  notes: string | null;
  children: ChapterNode[];
}

export interface ChapterTree {
  subject_id: number;
  nodes: ChapterNode[];
}

export interface SubjectProgress {
  id: number;
  name: string;
  icon: string;
  color: string;
  total_kps: number;
  rated_kps: number;
  avg_mastery: number;
  coverage: number;
}

export interface ProgressOverview {
  subjects: SubjectProgress[];
}

export function getChapters(subjectId: number): Promise<ChapterTree> {
  return apiFetch<ChapterTree>(`/api/chapters?subject_id=${subjectId}`);
}

export function createChapter(body: {
  subject_id: number;
  parent_id?: number;
  name: string;
  sort_order?: number;
  description?: string;
}): Promise<ChapterNode> {
  return apiFetch<ChapterNode>("/api/chapters", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateChapter(nodeId: number, body: {
  name?: string;
  sort_order?: number;
  description?: string;
}): Promise<ChapterNode> {
  return apiFetch<ChapterNode>(`/api/chapters/${nodeId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteChapter(nodeId: number): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/chapters/${nodeId}`, { method: "DELETE" });
}

export function updateChapterRating(nodeId: number, rating: number): Promise<ChapterNode> {
  return apiFetch<ChapterNode>(`/api/chapters/${nodeId}/rating`, {
    method: "PATCH",
    body: JSON.stringify({ rating }),
  });
}

export function updateChapterNotes(nodeId: number, notes: string): Promise<ChapterNode> {
  return apiFetch<ChapterNode>(`/api/chapters/${nodeId}/notes`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });
}

export function getProgressOverview(): Promise<ProgressOverview> {
  return apiFetch<ProgressOverview>("/api/chapters/progress");
}

// ── 批量导入 ──

export interface ImportQuestion {
  subject_id: number;
  question_content: string;
  knowledge_point_name?: string;
  question_pattern_name?: string;
  question_type?: string;
  correct_answer?: string;
  student_answer?: string;
  solution_steps?: string;
  error_analysis?: string;
  improvement_tips?: string;
  image_url?: string;
}

export interface ImportResult {
  saved_count: number;
  saved_ids: number[];
}

export function importQuestions(questions: ImportQuestion[]): Promise<ImportResult> {
  return apiFetch<ImportResult>("/api/upload/import", {
    method: "POST",
    body: JSON.stringify({ questions }),
  });
}
