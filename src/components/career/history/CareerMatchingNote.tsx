import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Typography } from "@/components/ui/typography";
import type { CareerMatchingNote as MatchingNote } from "@/lib/career/matching/listTypes";

/** Internal, development-only inspection of Harper's notes linked to this matching. */
export default function CareerMatchingNote({
  userId,
  matchingId,
}: {
  userId: string;
  matchingId: string;
}) {
  const [open, setOpen] = useState(false);
  const { fetchWithAuth } = useCareerApi();
  const note = useQuery({
    queryKey: ["career-matching-note", userId, matchingId],
    enabled: open && process.env.NODE_ENV === "development",
    queryFn: async ({ signal }): Promise<MatchingNote> => {
      const response = await fetchWithAuth(
        `/api/talent/matchings/note?${new URLSearchParams({ matchingId })}`,
        { signal }
      );
      if (!response.ok) throw new Error("Unable to load matching note");
      return response.json();
    },
  });
  return (
    <details
      className="mb-4 rounded-lg border border-stroke-subtle px-4 py-3"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm text-neutral-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stroke-focus">
        노트
      </summary>
      {open ? (
        <div className="mt-4 space-y-4">
          {note.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {note.isError ? (
            <div role="alert" className="space-y-2 text-sm text-critical">
              <Typography variant="description">
                노트를 불러오지 못했어요.
              </Typography>
              <MuteButton size="sm" onClick={() => void note.refetch()}>
                다시 시도
              </MuteButton>
            </div>
          ) : null}
          {note.data?.notes.length === 0 ? (
            <Typography variant="description">아직 노트가 없어요.</Typography>
          ) : null}
          {note.data?.notes.map((item) => (
            <div key={item.id} className="min-w-0 space-y-1">
              <Typography variant="caption">
                {item.kind} · {item.title} · revision {item.revision} · {item.updated_at}
              </Typography>
              <RichText
                variant="career"
                typography="description"
                className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
              >
                {item.content}
              </RichText>
            </div>
          ))}
        </div>
      ) : null}
    </details>
  );
}
