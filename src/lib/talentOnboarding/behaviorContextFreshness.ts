type BehaviorContextFreshnessAdmin = {
  from: (table: string) => any;
};

export async function hasPendingBehaviorContextChanges(args: {
  admin: BehaviorContextFreshnessAdmin;
  asOf?: string | null;
  lastConsumedChangeId: number;
  userId: string;
}) {
  let query = args.admin
    .from("talent_behavior_context_changes")
    .select("id")
    .eq("talent_id", args.userId)
    .gt("id", args.lastConsumedChangeId);

  if (args.asOf) {
    query = query.lte("occurred_at", args.asOf).lte("created_at", args.asOf);
  }

  const { data, error } = await query.order("id", { ascending: true }).limit(1);

  if (error) {
    throw new Error(
      error.message ?? "Failed to check pending behavior context changes"
    );
  }
  if (!Array.isArray(data)) {
    throw new Error("Invalid pending behavior context change result");
  }

  return data.length > 0;
}
