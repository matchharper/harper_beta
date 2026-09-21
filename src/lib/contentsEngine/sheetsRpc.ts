import { createClient } from "@supabase/supabase-js";

type RpcContract = {
  keys: readonly string[];
  actorEmail?: boolean;
};

const RPC_CONTRACTS: Record<string, RpcContract> = {
  gtm_api: {
    keys: [
      "action",
      "entity",
      "id",
      "expected_version",
      "data",
      "request_id",
    ],
  },
  gtm_compensation_strategy_save: {
    keys: ["id", "expected_version", "data", "request_id"],
  },
  gtm_outreach_review: {
    actorEmail: true,
    keys: [
      "dispatch_id",
      "expected_version",
      "action",
      "subject",
      "body",
      "scheduled_at",
      "review_note",
      "request_id",
    ],
  },
  gtm_sheet_view: {
    keys: ["view", "id", "limit", "offset"],
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildContentsEngineSheetsRpc(args: {
  actorEmail: string;
  params: unknown;
  rpc: unknown;
  serverToken: string;
}) {
  if (typeof args.rpc !== "string" || !RPC_CONTRACTS[args.rpc]) {
    throw new Error("Unknown Contents Engine Sheet operation");
  }
  if (!isPlainObject(args.params)) {
    throw new Error("Contents Engine Sheet operation parameters are required");
  }
  if (!args.serverToken.trim()) {
    throw new Error("GTM_CONTENTS_ENGINE_SERVER_TOKEN is required");
  }

  const contract = RPC_CONTRACTS[args.rpc];
  const unknownKeys = Object.keys(args.params).filter(
    (key) => !contract.keys.includes(key)
  );
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown operation field: ${unknownKeys[0]}`);
  }

  const rpcArgs: Record<string, unknown> = {
    p_token: args.serverToken.trim(),
  };
  for (const key of contract.keys) {
    if (Object.prototype.hasOwnProperty.call(args.params, key)) {
      rpcArgs[`p_${key}`] = args.params[key];
    }
  }
  if (contract.actorEmail) rpcArgs.p_actor_email = args.actorEmail;

  return { rpc: args.rpc, rpcArgs };
}

export async function runContentsEngineSheetsRpc(args: {
  actorEmail: string;
  params: unknown;
  rpc: unknown;
}) {
  const operation = buildContentsEngineSheetsRpc({
    ...args,
    serverToken: process.env.GTM_CONTENTS_ENGINE_SERVER_TOKEN ?? "",
  });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server misconfigured: missing Supabase admin credentials");
  }
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any;
  const { data, error } = await client.rpc(operation.rpc, operation.rpcArgs);
  if (error) throw new Error(error.message ?? "Contents Engine RPC failed");
  return data;
}
