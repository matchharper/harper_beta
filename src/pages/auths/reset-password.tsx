import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!router.isReady) return;

    const prepareRecovery = async () => {
      const code = typeof router.query.code === "string" ? router.query.code : "";
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          code
        );
        if (exchangeError) {
          setError("재설정 링크가 유효하지 않거나 만료되었습니다. 다시 요청해 주세요.");
          return;
        }
      }

      await supabase.auth.getSession();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("재설정 링크가 유효하지 않거나 만료되었습니다. 다시 요청해 주세요.");
        return;
      }

      setIsReady(true);
    };

    prepareRecovery();
  }, [router.isReady, router.query.code]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!password) {
      setError("새 비밀번호를 입력해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setError("");
    setSuccess("");
    setIsSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setIsSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess("비밀번호가 변경되었습니다. 다시 로그인해 주세요.");
    setTimeout(() => {
      router.replace("/");
    }, 1200);
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-2xl font-semibold">비밀번호 재설정</h1>
        <p className="text-sm text-white/70 mt-2">
          새 비밀번호를 입력하고 저장해 주세요.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-white/90">새 비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!isReady || isSubmitting}
              className="w-full rounded-md bg-white/10 border border-white/20 px-3 py-2.5 outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-white/90">새 비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={!isReady || isSubmitting}
              className="w-full rounded-md bg-white/10 border border-white/20 px-3 py-2.5 outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-400">{success}</p>}

          <button
            type="submit"
            disabled={!isReady || isSubmitting}
            className="w-full rounded-md bg-accenta1 text-black font-medium py-2.5 disabled:opacity-60"
          >
            {isSubmitting ? "저장 중..." : "비밀번호 변경"}
          </button>
        </form>
      </div>
    </main>
  );
}
