"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/router";
import GradientBackground from "@/components/landing/GradientBackground";
import Header from "@/components/landing/Header";
import { supabase } from "@/lib/supabase";

type ActivationState =
  | "loading"
  | "needs_login"
  | "success"
  | "error"
  | "missing_token";

export default function RequestAccessActivatePage() {
  const router = useRouter();
  const interactiveRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ActivationState>("loading");
  const [message, setMessage] = useState("");

  const token = useMemo(() => {
    if (!router.isReady) return "";
    const raw = router.query.token;
    return typeof raw === "string" ? raw.trim() : "";
  }, [router.isReady, router.query.token]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setState("missing_token");
      setMessage("Invalid access link.");
      return;
    }

    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (!cancelled) {
          setState("needs_login");
          setMessage(
            "Log in with the same email you used for Harper, then open this link again."
          );
        }
        return;
      }

      const response = await fetch("/api/request-access/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        if (!cancelled) {
          setState("error");
          setMessage(json.error || "Failed to activate access.");
        }
        return;
      }

      if (!cancelled) {
        setState("success");
        setMessage("Your access is ready. Redirecting to Harper...");
        setTimeout(() => {
          router.replace("/my");
        }, 900);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, router.isReady, token]);

  return (
    <div className="relative min-h-screen bg-black px-4 text-white font-inter">
      <Header page="company" />
      <GradientBackground interactiveRef={interactiveRef} />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="w-full max-w-lg rounded-xl border border-white/5 bg-white/5 p-8 text-center backdrop-blur-md">
          <div className="text-2xl font-medium">Request Access</div>
          <p className="mt-4 text-sm leading-6 text-white/70">{message}</p>
          {state === "loading" || state === "success" ? (
            <div className="mt-6 flex justify-center">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
