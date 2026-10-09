import { NextResponse } from "next/server";
import type { ServiceStatusResponse } from "@/lib/serviceStatus";

export async function GET() {
  const widgetUrl = process.env.HARPER_STATUS_WIDGET_URL?.trim();
  const unavailable = () =>
    NextResponse.json<ServiceStatusResponse>(
      { status: "unknown" },
      { headers: { "Cache-Control": "no-store" } }
    );

  if (!widgetUrl) return unavailable();

  try {
    const response = await fetch(widgetUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return unavailable();

    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("ongoing_incidents" in data) ||
      !Array.isArray(data.ongoing_incidents) ||
      !("in_progress_maintenances" in data) ||
      !Array.isArray(data.in_progress_maintenances) ||
      !("scheduled_maintenances" in data) ||
      !Array.isArray(data.scheduled_maintenances)
    ) {
      return unavailable();
    }

    return NextResponse.json<ServiceStatusResponse>(
      {
        status: data.ongoing_incidents.length
          ? "incident"
          : data.in_progress_maintenances.length
            ? "maintenance"
            : "operational",
      },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } }
    );
  } catch {
    return unavailable();
  }
}
