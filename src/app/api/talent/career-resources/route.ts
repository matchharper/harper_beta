import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFreshRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { readResource } from "@/lib/career/resources/read";
import { readSet, readCollection } from "@/lib/career/resources/sets";
import { readView, listViews, writeView } from "@/lib/career/resources/views";
import {
  applicationShelf,
  countUnboundOpportunities,
  readOpportunity,
  listOpportunities,
  writeOpportunity,
  wrapLegacyOpportunity,
} from "@/lib/career/opportunities/store";
import {
  ResourceError,
  databaseError,
  resourceDb,
  resourceRefSchema,
  selectorSchema,
} from "@/lib/career/resources/types";
import { admitResourceInteraction } from "@/lib/career/resources/interaction";
import { startCareerReply } from "@/lib/career/directReply.server";

export const maxDuration = 800;
const mutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("move"),
      kind: z.enum(["opportunity", "view"]),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      direction: z.enum(["up", "down"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("opportunity"),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      requestId: z.string().uuid(),
      patch: z
        .object({
          saved: z.boolean().optional(),
          archived: z.boolean().optional(),
          display_order: z.number().finite().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("view"),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      requestId: z.string().uuid(),
      archived: z.boolean().optional(),
      displayOrder: z.number().finite().optional(),
    })
    .strict(),
  z
    .object({ action: z.literal("interact"), interaction: z.unknown() })
    .strict(),
]);
const failure = (error: unknown) =>
  NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : "Unable to read resources",
    },
    {
      status:
        error instanceof ResourceError
          ? error.status
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 500,
    }
  );
export async function GET(req: NextRequest) {
  const user = await getFreshRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = { admin: getTalentSupabaseAdmin(), userId: user.id },
    p = req.nextUrl.searchParams;
  try {
    const kind = p.get("kind"),
      id = p.get("id");
    if (p.get("format") === "resource")
      return NextResponse.json({
        item: await readResource(
          context,
          resourceRefSchema.parse({
            kind,
            id,
            revision: p.get("revision") ?? undefined,
          })
        ),
      });
    if (kind === "opportunity-counts")
      return NextResponse.json(await countUnboundOpportunities(context));
    if (kind === "opportunity")
      return NextResponse.json(
        id
          ? { item: await readOpportunity(context, id) }
          : await listOpportunities(context, {
              unbound: p.get("unbound") === "true",
              applicationShelf: applicationShelf.optional().parse(p.get("applicationShelf") ?? undefined),
              saved: p.has("saved") ? p.get("saved") === "true" : undefined,
              archived: p.get("archived") === "true",
              cursor: p.get("cursor") ?? undefined,
            })
      );
    if (kind === "legacy" && id)
      return NextResponse.json({
        item: await wrapLegacyOpportunity(context, id),
      });
    if (kind === "view")
      return NextResponse.json(
        id
          ? { item: await readView(context, id) }
          : await listViews(context, {
              cursor: p.get("cursor") ?? undefined,
              archived: p.get("archived") === "true",
            })
      );
    if (kind === "collection" && id) {
      const view = await readView(context, id);
      if (String(view.revision) !== p.get("revision"))
        throw new ResourceError("View revision conflict.", 409);
      const block = view.definition.blocks.find(
        (b) => b.id === p.get("blockId")
      );
      if (!block || block.type !== "collection")
        throw new ResourceError("Collection unavailable.", 404);
      return NextResponse.json(
        await readCollection(
          context,
          block.selection,
          p.get("cursor") ?? undefined
        )
      );
    }
    if (kind === "set" && id)
      return NextResponse.json(
        await readSet(context, {
          setId: z.string().uuid().parse(id),
          revision: z.coerce.number().int().positive().parse(p.get("revision")),
          selector: p.get("selector")
            ? selectorSchema.parse(JSON.parse(p.get("selector")!))
            : undefined,
          cursor: p.get("cursor") ?? undefined,
          limit: 50,
        })
      );
    return NextResponse.json({
      item: await readResource(
        context,
        resourceRefSchema.parse({
          kind,
          id,
          revision: p.get("revision") ?? undefined,
        })
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  const user = await getFreshRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = { admin: getTalentSupabaseAdmin(), userId: user.id };
  try {
    const input = mutationSchema.parse(await req.json());
    if (input.action === "move") {
      const result = await resourceDb(context.admin).rpc(
        "career_move_resource_v1",
        {
          p_user: context.userId,
          p_kind: input.kind,
          p_id: input.id,
          p_revision: input.expectedRevision,
          p_direction: input.direction,
        }
      );
      databaseError(result.error);
      return NextResponse.json({ moved: true });
    }
    if (input.action === "opportunity")
      return NextResponse.json({
        item: await writeOpportunity(context, { ...input, actor: "user" }),
      });
    if (input.action === "view")
      return NextResponse.json({
        item: await writeView(context, { ...input, actor: "user" }),
      });
    const admitted = await admitResourceInteraction(context, input.interaction);
    void startCareerReply(
      { ...context, conversationId: admitted.conversationId },
      admitted.message,
      after
    );
    return NextResponse.json(
      {
        accepted: true,
        messageId: admitted.message.id,
        conversationId: admitted.conversationId,
      },
      { status: 202 }
    );
  } catch (error) {
    return failure(error);
  }
}
