import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OrgMessageTemplate,
  OrgMessageTemplateContent,
  OrgMessageTemplateKind,
} from "@/lib/org/messageTemplates";

const templatesKey = (workspaceId: string, kind: OrgMessageTemplateKind) => [
  "org",
  "message-templates",
  workspaceId,
  kind,
];

export function useOrgMessageTemplates<K extends OrgMessageTemplateKind>(args: {
  enabled?: boolean;
  kind: K;
  workspaceId: string;
}) {
  const client = useQueryClient();
  const queryKey = templatesKey(args.workspaceId, args.kind);
  const query = useQuery({
    enabled: (args.enabled ?? true) && Boolean(args.workspaceId),
    queryFn: () =>
      fetchWithInternalAuth<{ templates: OrgMessageTemplate<K>[] }>(
        `/api/org/message-templates?workspaceId=${encodeURIComponent(args.workspaceId)}&kind=${args.kind}`
      ),
    queryKey,
    retry: 1,
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (input: {
      content: OrgMessageTemplateContent[K];
      id?: string | null;
      name: string;
    }) =>
      fetchWithInternalAuth<{ template: OrgMessageTemplate<K> }>(
        "/api/org/message-templates",
        {
          body: JSON.stringify({
            action: "save",
            kind: args.kind,
            workspaceId: args.workspaceId,
            ...input,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      ),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchWithInternalAuth<{ ok: true }>("/api/org/message-templates", {
        body: JSON.stringify({
          action: "delete",
          id,
          workspaceId: args.workspaceId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  return {
    remove,
    save,
    templates: query.data?.templates ?? [],
    templatesQuery: query,
  };
}
