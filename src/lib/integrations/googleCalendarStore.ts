import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type CalendarIntegrationRow =
  Database["public"]["Tables"]["company_user_integrations"]["Row"];

export type GoogleCalendarStore = {
  find(userId: string): Promise<CalendarIntegrationRow | null>;
  insert(
    userId: string,
    accountId: string
  ): Promise<CalendarIntegrationRow | null>;
  setStatus(
    row: CalendarIntegrationRow,
    status: string
  ): Promise<CalendarIntegrationRow | null>;
  remove(row: CalendarIntegrationRow): Promise<boolean>;
};

export function createGoogleCalendarStore(
  admin: SupabaseClient<Database>
): GoogleCalendarStore {
  const table = () => admin.from("company_user_integrations");
  return {
    async find(userId) {
      const { data, error } = await table()
        .select("*")
        .eq("company_user_id", userId)
        .eq("provider", "google_calendar")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async insert(userId, accountId) {
      const { data, error } = await table()
        .insert({
          company_user_id: userId,
          provider: "google_calendar",
          composio_connected_account_id: accountId,
          status: "active",
        })
        .select("*")
        .single();
      if (error?.code === "23505") return null;
      if (error) throw error;
      return data;
    },
    async setStatus(row, status) {
      const updatedAt = new Date(
        Math.max(Date.now(), Date.parse(row.updated_at) + 1)
      ).toISOString();
      const { data, error } = await table()
        .update({ status, updated_at: updatedAt })
        .eq("company_user_id", row.company_user_id)
        .eq("provider", "google_calendar")
        .eq("composio_connected_account_id", row.composio_connected_account_id)
        .eq("status", row.status)
        .eq("updated_at", row.updated_at)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async remove(row) {
      const { data, error } = await table()
        .delete()
        .eq("company_user_id", row.company_user_id)
        .eq("provider", "google_calendar")
        .eq("composio_connected_account_id", row.composio_connected_account_id)
        .eq("status", row.status)
        .eq("updated_at", row.updated_at)
        .select("company_user_id");
      if (error) throw error;
      return Boolean(data?.length);
    },
  };
}
