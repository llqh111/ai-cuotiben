"use client";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authenticate, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !passphrase) {
      setError("请填写昵称与口令");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // register 接口：组合命中即登录，否则建号。一个按钮覆盖登录/注册。
      await authenticate("register", nickname.trim(), passphrase);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "网络异常，请确认后端已启动");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-md"
      >
        <div className="premium-shell">
          <div className="premium-core p-8 md:p-12">
            <h1 className="mb-2 text-3xl font-semibold tracking-tighter">开始使用</h1>
            <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">输入昵称与口令，在任意设备同步你的错题与学习进度。</p>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">昵称</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition-all focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-600 dark:focus:bg-[#0a0a0a]"
                  placeholder="例如：李雷"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">口令</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition-all focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-600 dark:focus:bg-[#0a0a0a]"
                  placeholder="设置或输入你的专属口令"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="mt-4">
                <Button type="submit" disabled={loading} className="w-full justify-center" icon>
                  {loading ? "处理中…" : "登录 / 注册"}
                </Button>
              </div>
            </form>
            <p className="mt-6 text-xs text-zinc-400 leading-relaxed">
              提示：同一昵称配不同口令视为不同账号。请记牢你的口令，它就是你的身份。
            </p>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
