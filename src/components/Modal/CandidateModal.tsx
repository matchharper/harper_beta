import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCandidateModalStore } from "@/store/useCandidateModalStore";
import CandidateProfileDetailPage from "@/pages/my/p/CandidateProfile";
import { ExpandIcon, XIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useCandidateDetail } from "@/hooks/useCandidateDetail";

const CandidateModalRoot = () => {
  const router = useRouter();
  const { isOpen, payload, close } = useCandidateModalStore();
  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;
  const candidId = payload?.candidId;
  useEffect(() => {
    if (!isOpen) return;
    history.pushState({ modal: "candidate" }, "");

    const onPopState = (e: PopStateEvent) => close();

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [isOpen, close]);
  const { data, isLoading, error } = useCandidateDetail(userId, candidId);

  return (
    <AnimatePresence>
      {isOpen && payload && (
        <motion.div
          className="absolute top-0 left-0 z-50 min-h-screen h-full px-8 overflow-y-scroll pb-20 font-sans w-full bg-hgray200 text-hgray900 shadow-2xl border-l border-hgray200"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "tween", ease: "easeOut", duration: 0.1 }}
        >
          <div className="absolute top-4 right-4 flex flex-row items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                router.push(`/my/p/${payload.candidId}`);
              }}
              className="rounded-sm bg-white/0 px-1 py-1 text-sm hover:bg-white/5 cursor-pointer"
            >
              <ExpandIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-sm bg-white/0 px-1 py-1 text-sm hover:bg-white/5 cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="h-4" />
          {payload.candidId && data && (
            <CandidateProfileDetailPage
              candidId={payload.candidId}
              data={data}
              isLoading={isLoading}
              error={error}
            />
          )}
          {(!payload.candidId || isLoading) && <div>로딩중입니다.</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CandidateModalRoot;
