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

export interface UploadResult {
  id: number;
  subject?: string;
  knowledge_point_id?: number;
  question_content?: string;
  analysis?: string;
  answer?: string;
}

export async function uploadQuestion(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file); // 对应 FastAPI 的 file 字段
  return apiFetch<UploadResult>("/api/upload/", { method: "POST", body: fd });
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
