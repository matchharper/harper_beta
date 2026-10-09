import { supabase } from "@/lib/supabase";
import type { AnnouncementReceipts } from "./queue";

export const announcementReceipts: AnnouncementReceipts = {
  async listSeen(userId) {
    const { data, error } = await supabase
      .from("user_announcement_receipts")
      .select("announcement_id")
      .eq("user_id", userId);
    if (error) throw error;
    return new Set(data.map((row) => row.announcement_id));
  },
  async claim(userId, announcementId) {
    const { data, error } = await supabase
      .from("user_announcement_receipts")
      .upsert(
        { user_id: userId, announcement_id: announcementId },
        { onConflict: "user_id,announcement_id", ignoreDuplicates: true }
      )
      .select("announcement_id");
    if (error) throw error;
    return data.length === 1;
  },
};
