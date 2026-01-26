import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { generateOneLineSummary, generateSummary } from "./utils";

export async function POST(req: NextRequest) {
  if (req.method !== "POST")
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json();

  if (body.is_one_line) {
    const { doc } = body as {
      doc: any;
      is_one_line: boolean;
    };
    const summary = await generateOneLineSummary(doc);

    const { error: insErr } = await supabase.from("summary").insert({
      candid_id: doc.id,
      text: summary as string,
    });

    return NextResponse.json(
      { result: summary, success: true },
      { status: 200 }
    );
  }

  const { doc, queryId, criteria, raw_input_text } = body as {
    doc: any;
    queryId: string;
    criteria: string[];
    raw_input_text: string;
  };

  if (!doc || !criteria || !raw_input_text)
    return NextResponse.json(
      { error: "Missing userId or queryText" },
      { status: 400 }
    );

  const summary = await generateSummary(doc, criteria, raw_input_text);
  // logger.log("summary ", summary);

  try {
    const jsonoutput = JSON.parse(summary as string);
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
  }

  const { error: insErr } = await supabase.from("synthesized_summary").insert({
    candid_id: doc.id,
    query_id: queryId,
    text: summary as string,
  });

  if (insErr)
    return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ result: summary, success: true }, { status: 200 });
}
