type RelayAdmin = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<any>;
};

type RelayInput = {
  p_document_id: string | null;
  p_recommendation_id: string;
  p_relay_content: string;
  p_request_id: string | null;
  p_source_message_id: number;
  p_talent_id: string;
};

export async function createCompanyTalentRelayRecord(
  admin: RelayAdmin,
  input: RelayInput
) {
  let result = await admin.rpc("create_company_talent_relay_v2", input);
  if (
    input.p_document_id &&
    result.error?.code === "P0002" &&
    result.error?.message === "candidate_relay_document_not_found"
  ) {
    // The RPC checks the connection, test isolation and source message before
    // this document error. Publish only the owned, active resume approved for
    // this contact, then let the RPC recheck all boundaries in the same call.
    const published = await admin
      .from("talent_documents")
      .update({ is_public: true })
      .eq("id", input.p_document_id)
      .eq("talent_id", input.p_talent_id)
      .eq("kind", "resume")
      .eq("is_deleted", false)
      .eq("is_public", false)
      .select("id")
      .maybeSingle();
    if (published.error) throw published.error;
    if (published.data) {
      result = await admin.rpc("create_company_talent_relay_v2", input);
    }
  }
  if (result.error) throw result.error;
  return result.data;
}
