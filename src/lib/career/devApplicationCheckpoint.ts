import {
  CHECKPOINT_OWNERS,
  CHECKPOINT_CHILDREN,
  type CheckpointScopes,
} from "./devCheckpointData";

export const APPLICATION_CHECKPOINT_USER_ID =
  "0c28e543-f525-4780-84eb-0152679cf530";
export const APPLICATION_CHECKPOINT_EMAIL = "khj6051@optimizerai.xyz";
export const APPLICATION_CHECKPOINT_LABEL =
  "채널톡 지원 전 · 2026-11-08 14:20:42 KST";
export const APPLICATION_CHECKPOINT_SHA256 =
  "23349cd63f3a6b85bd453eae9d8f5f913d5154515f4e64606dcec4a3f13ec4f8";
export const APPLICATION_CHECKPOINT_SCOPES: CheckpointScopes = {
  owners: {
    ...CHECKPOINT_OWNERS,
    career_action_items: "user_id",
    career_content_suggestions: "user_id",
    talent_agent_runtime: "user_id",
    talent_agent_work_runtime: "user_id",
    talent_external_operations: "user_id",
    talent_profiles: "talent_id",
    talent_role_materials: "talent_id",
    talent_matchings: "talent_id",
    talent_matching_operations: "talent_id",
    talent_opportunity_memberships: "talent_id",
  },
  children: {
    ...CHECKPOINT_CHILDREN,
    talent_profile_revisions: {
      column: "profile_id",
      parent: "talent_profiles",
      key: "id",
    },
    talent_role_material_files: {
      column: "material_id",
      parent: "talent_role_materials",
      key: "id",
    },
  },
};
export const APPLICATION_CHECKPOINT_TABLES = [
  ...Object.keys(APPLICATION_CHECKPOINT_SCOPES.owners),
  ...Object.keys(APPLICATION_CHECKPOINT_SCOPES.children),
];
