import { describe, it, expect, beforeEach } from "vitest";
import {
  subjectName,
  SUBJECTS,
  getToken,
  setToken,
  clearToken,
  ApiError,
} from "@/lib/api";

// ============================================================
// 纯函数 & 常量
// ============================================================

describe("SUBJECTS", () => {
  it("包含 6 个科目，id 1-6", () => {
    expect(SUBJECTS).toHaveLength(6);
    SUBJECTS.forEach((s, i) => {
      expect(s.id).toBe(i + 1);
    });
  });

  it("科目名为中文", () => {
    const names = SUBJECTS.map((s) => s.name);
    expect(names).toEqual(["语文", "数学", "英语", "物理", "化学", "生物"]);
  });
});

describe("subjectName", () => {
  it("id=1 返回 语文", () => {
    expect(subjectName(1)).toBe("语文");
  });

  it("id=4 返回 物理", () => {
    expect(subjectName(4)).toBe("物理");
  });

  it("字符串 id 也能匹配", () => {
    expect(subjectName("3")).toBe("英语");
  });

  it("不存在的 id 返回字符串本身", () => {
    expect(subjectName(99)).toBe("99");
  });

  it("不存在的字符串 id 返回原值", () => {
    expect(subjectName("unknown")).toBe("unknown");
  });
});

// ============================================================
// token 管理（localStorage）
// ============================================================

describe("token 管理", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("无 token 时 getToken 返回 null", () => {
    expect(getToken()).toBeNull();
  });

  it("setToken 后 getToken 能取回", () => {
    setToken("abc123");
    expect(getToken()).toBe("abc123");
  });

  it("clearToken 后 getToken 返回 null", () => {
    setToken("abc123");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("setToken 覆盖旧 token", () => {
    setToken("old");
    setToken("new");
    expect(getToken()).toBe("new");
  });
});

// ============================================================
// ApiError
// ============================================================

describe("ApiError", () => {
  it("是 Error 的子类", () => {
    const err = new ApiError("未授权", 401);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });

  it("name 为 ApiError", () => {
    const err = new ApiError("msg", 500);
    expect(err.name).toBe("ApiError");
  });

  it("message 和 status 都正确存储", () => {
    const err = new ApiError("服务器错误", 500);
    expect(err.message).toBe("服务器错误");
    expect(err.status).toBe(500);
  });
});
