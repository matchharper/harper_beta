import { z } from "zod";
import type { TalentToolDefinition } from "@/lib/talentOnboarding/tools";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { parseCareerJobUrl } from "./jobLinkImport";
import {
  CAREER_CONTENT_KINDS,
  formatCareerContentSuggestion,
} from "./contentSuggestions";
import {
  listCareerContentSuggestions,
  manageCareerContentSuggestion,
} from "./contentSuggestions.server";

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");
const itemSchema = z.object({
  kind: z.enum(CAREER_CONTENT_KINDS),
  url: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300),
  reason: z.string().trim().min(1).max(400),
  source: z.string().trim().max(80).optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
  location: z.string().trim().max(120).optional(),
  publishedAt: isoDate.optional(),
  deadline: isoDate.optional(),
});
const inputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list") }),
  z.object({
    operation: z.literal("add"),
    origin: z.enum(["user_request", "harper_offer"]).optional(),
    items: z.array(itemSchema).min(1).max(10),
  }),
  z.object({
    operation: z.enum(["remove", "mark_registered", "unmark_registered"]),
    ids: z.array(z.string().uuid()).min(1).max(20),
  }),
]);
const ID_OPERATIONS = {
  remove: { operation: "remove", reaction: null },
  mark_registered: { operation: "react", reaction: "registered" },
  unmark_registered: { operation: "react", reaction: "unregistered" },
} as const;

/** A link that identifies a single job posting belongs in Jobs, not here. */
export function careerContentJobPostingUrl(url: string) {
  try {
    const identity = parseCareerJobUrl(url);
    if (identity.provider !== "other" && identity.providerJobId)
      return identity.canonicalUrl;
  } catch {
    return null;
  }
  return null;
}

const DATE_FIELDS = ["startsAt", "endsAt", "publishedAt", "deadline"] as const;
/** The database reads exact instants, so pass dates in one unambiguous form. */
function isoDates(item: Partial<Record<(typeof DATE_FIELDS)[number], string>>) {
  return Object.fromEntries(
    DATE_FIELDS.flatMap((field) =>
      item[field]
        ? [[field, new Date(Date.parse(item[field]!)).toISOString()]]
        : []
    )
  );
}

function canonicalContentUrl(url: string) {
  try {
    return parseCareerJobUrl(url).canonicalUrl;
  } catch {
    return null;
  }
}

export const CAREER_CONTENT_SUGGESTION_TOOLS: Record<
  string,
  TalentToolDefinition
> = {
  manage_content_suggestions: {
    name: "manage_content_suggestions",
    channels: ["chat"],
    description:
      "Read, save or remove events, sign-ups, articles and social posts shown in the user's \"볼 만한 것\" list on Career home. kind: event is a meetup, conference or webinar at a set time; signup is something the user joins by applying or reaching out that is neither a job nor a timed event (fellowship, contest, course or bootcamp recruiting, coffee chat, mentoring, office hours), with its deadline when stated; article is something to read; post is a social post worth a look. Items persist across visits until they expire: an event after it ends (endsAt, else one day after startsAt), anything else after 30 days, or earlier at a deadline the item itself states. The list keeps one entry per link per user, so a link the user dismissed is never shown again. Job postings and hiring posts are not accepted; save those to Jobs with save_job_posting. list returns current items. add saves up to 10 items; each needs kind, the real url, a short title and a one-sentence reason in the user's language; events also need startsAt (ISO 8601, with time zone) and past events are rejected. origin is user_request when the user asked for such items and harper_offer when Harper offered them and the user agreed. remove withdraws items by id. mark_registered records that the user said they signed up for a saved event or sign-up (status registered; the card shows 신청했어요); unmark_registered takes that back. The user can also press 신청했어요 on the card. Harper cannot see event sites, so registered is the user's own word: use mark_registered only when the user says so, never because they opened the link. For a registered event or sign-up that is coming up, a preparation follow-up can help. Saving does not register the user for anything or contact anyone.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "list",
            "add",
            "remove",
            "mark_registered",
            "unmark_registered",
          ],
        },
        origin: {
          type: "string",
          enum: ["user_request", "harper_offer"],
          description: "For add only. Ignored in scheduled background work.",
        },
        items: {
          type: "array",
          description: "For add only.",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: [...CAREER_CONTENT_KINDS],
                description:
                  "event: at a set time. signup: joined by applying or reaching out (fellowship, contest, course recruiting, coffee chat, mentoring, office hours). article: to read. post: a social post.",
              },
              url: { type: "string" },
              title: { type: "string" },
              reason: {
                type: "string",
                description:
                  "Why this fits the user, one sentence, shown on the card.",
              },
              source: {
                type: "string",
                description:
                  "Site or author name, e.g. LinkedIn, Luma, a blog name.",
              },
              startsAt: {
                type: "string",
                description: "Events: start time, ISO 8601.",
              },
              endsAt: {
                type: "string",
                description: "Events: end time if known.",
              },
              location: {
                type: "string",
                description: "Events: place or Online.",
              },
              publishedAt: {
                type: "string",
                description: "Articles/posts: publish date if known.",
              },
              deadline: {
                type: "string",
                description:
                  "A deadline the content itself states (apply by, registration closes). ISO 8601 with time zone; for a date-only deadline use the end of that day, e.g. 2026-11-20T23:59:59+09:00. Omit when none is stated; never guess. The item leaves the list at the earlier of this and its default end.",
              },
            },
            required: ["kind", "url", "title", "reason"],
            additionalProperties: false,
          },
        },
        ids: {
          type: "array",
          description:
            "For remove, mark_registered and unmark_registered. Exact item ids from list.",
          items: { type: "string" },
        },
      },
      required: ["operation"],
      additionalProperties: false,
    },
    async execute(raw, context) {
      if (!context?.admin || !context.userId)
        throw new Error("Authenticated conversation required");
      const scope = {
        admin: context.admin as TalentAdminClient,
        userId: context.userId,
      };
      const input = inputSchema.parse(raw);
      context.abortSignal?.throwIfAborted();
      if (input.operation === "list") {
        const items = await listCareerContentSuggestions(scope);
        return {
          items,
          modelOutput: items.length
            ? items.map(formatCareerContentSuggestion).join("\n\n")
            : "No current items.",
        };
      }
      if (input.operation !== "add") {
        const { operation, reaction } = ID_OPERATIONS[input.operation];
        const results = [];
        for (const id of input.ids) {
          context.abortSignal?.throwIfAborted();
          try {
            const result = await manageCareerContentSuggestion(scope, {
              operation,
              id,
              item: reaction ? { reaction } : null,
            });
            results.push({ id, status: result.status });
          } catch (error) {
            // Only events and sign-ups can be registered; report it and keep going.
            if (
              !/can be registered/.test(
                String((error as any)?.message ?? error)
              )
            )
              throw error;
            results.push({ id, status: "not_registrable" });
          }
        }
        return {
          results,
          modelOutput: results
            .map((result) => `${result.id}: ${result.status}`)
            .join("\n"),
        };
      }

      const runId = context.backgroundInvocation?.runId ?? null;
      const origin = runId
        ? "harper_background"
        : (input.origin ?? "user_request");
      const results = [];
      for (const item of input.items) {
        context.abortSignal?.throwIfAborted();
        const jobUrl = careerContentJobPostingUrl(item.url);
        if (jobUrl) {
          results.push({
            url: item.url,
            status: "rejected_job_posting",
            modelOutput: `${item.url}: rejected. This is a job posting; use save_job_posting with mode suggest instead.`,
          });
          continue;
        }
        const url = canonicalContentUrl(item.url);
        if (!url) {
          results.push({
            url: item.url,
            status: "rejected_invalid_url",
            modelOutput: `${item.url}: rejected. Not a valid web link.`,
          });
          continue;
        }
        try {
          const result = await manageCareerContentSuggestion(scope, {
            operation: "add",
            item: { ...item, ...isoDates(item), url },
            origin,
            conversationId: context.conversationId ?? null,
            runId,
          });
          results.push({
            url,
            status: result.status,
            id: result.id,
            modelOutput: [
              `${url}: ${result.status}${result.status === "already_saved" && result.item ? ` (current status ${result.item.status})` : ""}.`,
              result.item && result.status === "saved"
                ? formatCareerContentSuggestion(result.item)
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
          });
        } catch (error) {
          const message = String(
            (error as { message?: unknown } | null)?.message ?? error
          );
          const known =
            /Event date required|Event already ended|Deadline passed|Invalid content suggestion/.exec(
              message
            );
          if (!known) throw error;
          results.push({
            url,
            status: "rejected",
            modelOutput: `${url}: rejected (${known[0]}).`,
          });
        }
      }
      return {
        results,
        modelOutput: results.map((result) => result.modelOutput).join("\n\n"),
      };
    },
  },
};
