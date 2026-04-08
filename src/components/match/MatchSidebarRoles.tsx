"use client";

import type { MatchRoleRecord, MatchWorkspaceRecord } from "@/lib/match/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

type MatchSidebarRolesProps = {
  collapsed: boolean;
  roles: MatchRoleRecord[];
  workspace: MatchWorkspaceRecord | null;
};

export default function MatchSidebarRoles({
  collapsed,
  roles,
  workspace,
}: MatchSidebarRolesProps) {
  const router = useRouter();
  const activeRoleId =
    typeof router.query.roleId === "string" ? router.query.roleId : null;
  const activeWorkspaceId =
    typeof router.query.workspaceId === "string"
      ? router.query.workspaceId
      : (workspace?.companyWorkspaceId ?? null);

  if (collapsed) return null;

  return (
    <AnimatePresence initial={false}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        className="min-h-[20vh]"
      >
        <div className="ml-3 border-l border-white/0 pl-1">
          <div className="space-y-1">
            {roles.length === 0 ? (
              <></>
            ) : (
              roles.map((role, index) => {
                const isActive = activeRoleId === role.roleId;
                return (
                  <motion.div
                    key={role.roleId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Link
                      href={
                        activeWorkspaceId
                          ? `/my/match?workspaceId=${encodeURIComponent(
                              activeWorkspaceId
                            )}&roleId=${encodeURIComponent(role.roleId)}`
                          : `/my/match?roleId=${encodeURIComponent(role.roleId)}`
                      }
                      className={[
                        "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[12px] transition",
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-white/55 hover:bg-white/5 hover:text-white/80",
                      ].join(" ")}
                    >
                      <span className="truncate">{role.name}</span>
                      <span className="shrink-0 text-[10px] text-white/40">
                        {role.matchedCandidateCount}
                      </span>
                    </Link>
                  </motion.div>
                );
              })
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: roles.length * 0.03 + 0.06 }}
            className=""
          >
            <Link
              href={
                workspace
                  ? `/my/match?workspaceId=${encodeURIComponent(
                      workspace.companyWorkspaceId
                    )}&composer=role`
                  : "/my/match?composer=workspace"
              }
              className="flex items-center gap-2 rounded-full px-3 py-2 text-[12px] text-white/50 transition hover:bg-white/5 hover:text-white/80"
            >
              <Plus size={13} />
              <span>{workspace ? "Role 추가하기" : "Workspace 생성하기"}</span>
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
