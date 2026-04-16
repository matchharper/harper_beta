import { NextRequest, NextResponse } from "next/server";
import { notifySlack } from "@/app/api/hello/utils";
import { NETWORK_WAITLIST_TYPE } from "@/lib/networkOps";
import {
  TALENT_NETWORK_ABTEST_TYPE_B,
  createTalentNetworkLocalId,
} from "@/lib/talentNetwork";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const TALENT_NETWORK_CV_BUCKET = "talent-network-cv";
const MAX_RESUME_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_RESUME_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function getFileExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  const lastDotIndex = normalized.lastIndexOf(".");
  if (lastDotIndex < 0) return "";
  return normalized.slice(lastDotIndex + 1);
}

function normalizeLinkedinUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("올바른 링크드인 URL을 입력해 주세요.");
  }

  if (!parsed.hostname.toLowerCase().includes("linkedin.com")) {
    throw new Error("링크드인 프로필 URL을 입력해 주세요.");
  }

  return parsed.toString();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const rawLinkedinUrl = String(formData.get("linkedinUrl") ?? "").trim();
    const selectedRole =
      String(formData.get("selectedRole") ?? "").trim() || "Talent Network";
    const pagePath = String(formData.get("pagePath") ?? "").trim() || "/network";
    const localId =
      String(formData.get("localId") ?? "").trim() || createTalentNetworkLocalId();
    const campaign = String(formData.get("campaign") ?? "").trim() || "default";
    const ctaExperimentType =
      String(formData.get("ctaExperimentType") ?? "").trim() || null;
    const landingAbtestType =
      String(formData.get("landingAbtestType") ?? "").trim() ||
      TALENT_NETWORK_ABTEST_TYPE_B;
    const isMobile = String(formData.get("isMobile") ?? "").trim() === "true";
    const contactConsent =
      String(formData.get("contactConsent") ?? "").trim() === "true";
    const resumeEntry = formData.get("resume");
    const file = resumeEntry instanceof File ? resumeEntry : null;

    if (!name) {
      return NextResponse.json(
        { error: "Missing applicant name" },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "Missing applicant email" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid applicant email" },
        { status: 400 }
      );
    }

    if (!contactConsent) {
      return NextResponse.json(
        { error: "Contact consent is required" },
        { status: 400 }
      );
    }

    let linkedinUrl: string | null = null;
    try {
      linkedinUrl = normalizeLinkedinUrl(rawLinkedinUrl);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to validate LinkedIn URL",
        },
        { status: 400 }
      );
    }

    if (!linkedinUrl && !file) {
      return NextResponse.json(
        { error: "LinkedIn URL or resume is required" },
        { status: 400 }
      );
    }

    let uploadedStoragePath: string | null = null;
    let uploadedFileName: string | null = null;

    if (file) {
      if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: "Resume file is too large" },
          { status: 400 }
        );
      }

      const originalName = file.name?.trim() || "resume";
      const fileExtension = getFileExtension(originalName);

      if (!ALLOWED_RESUME_EXTENSIONS.has(fileExtension)) {
        return NextResponse.json(
          { error: "Resume must be a PDF, DOC, or DOCX file" },
          { status: 400 }
        );
      }

      const safeName = sanitizeFileName(originalName);
      const storagePath = `quick-apply/${localId}/${Date.now()}_${safeName}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await supabaseServer.storage
        .from(TALENT_NETWORK_CV_BUCKET)
        .upload(storagePath, buffer, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        return NextResponse.json(
          {
            error: uploadError.message ?? "Failed to upload resume",
          },
          { status: 500 }
        );
      }

      uploadedStoragePath = storagePath;
      uploadedFileName = originalName;
    }

    const submittedAt = new Date().toISOString();
    const profileInputTypes = [
      ...(linkedinUrl ? ["linkedin"] : []),
      ...(uploadedStoragePath ? ["cv"] : []),
    ];
    const detailPayload = {
      source:
        campaign === "wonderful"
          ? "network_quick_apply_modal_wonderful_v1"
          : "network_quick_apply_modal_v1",
      campaign,
      selected_role: selectedRole,
      profile_input_types: profileInputTypes,
      linkedin_profile_url: linkedinUrl,
      cv_file_name: uploadedFileName,
      cv_storage_bucket: uploadedStoragePath ? TALENT_NETWORK_CV_BUCKET : null,
      cv_storage_path: uploadedStoragePath,
      cta_experiment_type: ctaExperimentType,
      landing_abtest_type: landingAbtestType,
      contact_consent: contactConsent,
      page_path: pagePath,
      submitted_at: submittedAt,
    };

    const { data, error } = await supabaseServer
      .from("harper_waitlist")
      .insert({
        email,
        is_mobile: isMobile,
        local_id: localId,
        name,
        text: JSON.stringify(detailPayload),
        type: NETWORK_WAITLIST_TYPE,
        url: linkedinUrl || uploadedStoragePath,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to save network application" },
        { status: 500 }
      );
    }

    try {
      await notifySlack(`📝 *Talent Network Quick Apply Submitted*

• *Role*: ${selectedRole}
• *Name*: ${name}
• *Email*: ${email}
• *LinkedIn*: ${linkedinUrl || "Not provided"}
• *CV*: ${uploadedFileName || uploadedStoragePath || "Not provided"}
• *Consent*: ${contactConsent ? "Agreed" : "Missing"}
• *Campaign*: ${campaign}
• *CTA Experiment*: ${ctaExperimentType || "unknown"}
• *Landing Variant*: ${landingAbtestType}
• *Local ID*: ${localId}
• *Page*: ${pagePath}
• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);
    } catch (slackError) {
      console.error("network quick apply slack notify failed:", slackError);
    }

    return NextResponse.json({ id: data.id, ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to submit network application",
      },
      { status: 500 }
    );
  }
}
