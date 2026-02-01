import { supabase } from "@/lib/supabase";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";

// hooks/useLogEvent.ts
export function useLogEvent() {
    const { companyUser } = useCompanyUserStore();

    return async (type: string) => {
        console.log("logEvent: ", type, companyUser?.user_id);
        if (!companyUser?.user_id) return;

        await supabase
            .from("logs")
            .insert({ type, user_id: companyUser.user_id });
    };
}
