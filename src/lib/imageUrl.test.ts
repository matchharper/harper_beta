import assert from "node:assert/strict";
import test from "node:test";
import {
  getDisplayableCompanyLogoUrl,
  getDisplayableProfileImageUrl,
  getHarperSupabaseStorageImageUrl,
  normalizeHarperPublicImageUrl,
  resolveCompanyLogoUrl,
} from "@/lib/imageUrl";

test("normalizes Harper public image URLs to local paths", () => {
  assert.equal(
    normalizeHarperPublicImageUrl(
      "https://matchharper.com/images/logo.png"
    ),
    "/images/logo.png"
  );
  assert.equal(
    normalizeHarperPublicImageUrl(
      "https://www.matchharper.com/images/logo.png?v=2"
    ),
    "/images/logo.png?v=2"
  );
});

test("preserves local and external image URLs", () => {
  assert.equal(
    normalizeHarperPublicImageUrl("/images/logo.png"),
    "/images/logo.png"
  );
  assert.equal(
    normalizeHarperPublicImageUrl("https://example.com/images/logo.png"),
    "https://example.com/images/logo.png"
  );
  assert.equal(
    normalizeHarperPublicImageUrl("https://matchharper.com/avatar/logo.png"),
    "https://matchharper.com/avatar/logo.png"
  );
});

test("returns null for empty image URLs", () => {
  assert.equal(normalizeHarperPublicImageUrl(null), null);
  assert.equal(normalizeHarperPublicImageUrl("  "), null);
});

test("filters expired LinkedIn profile image URLs", () => {
  const nowMs = Date.UTC(2026, 6, 28);

  assert.equal(
    getDisplayableProfileImageUrl(
      "https://media.licdn.com/dms/image/test?e=1784764800&v=beta&t=signed",
      nowMs
    ),
    null
  );
  assert.equal(
    getDisplayableProfileImageUrl(
      "https://media.licdn.com/dms/image/test?e=1785283201&v=beta&t=signed",
      nowMs
    ),
    "https://media.licdn.com/dms/image/test?e=1785283201&v=beta&t=signed"
  );
});

test("preserves non-expiring profile image URLs", () => {
  assert.equal(
    getDisplayableProfileImageUrl(
      "https://lh3.googleusercontent.com/a/profile-photo"
    ),
    "https://lh3.googleusercontent.com/a/profile-photo"
  );
  assert.equal(getDisplayableProfileImageUrl(null), null);
});

test("filters expired LinkedIn company logos", () => {
  const nowMs = Date.UTC(2026, 7, 14);

  assert.equal(
    getDisplayableCompanyLogoUrl(
      "https://media.licdn.com/dms/image/company-logo?e=1781740800&v=beta&t=signed",
      nowMs
    ),
    null
  );
  assert.equal(
    getDisplayableCompanyLogoUrl(
      "https://media.licdn.com/dms/image/company-logo?e=1786838401&v=beta&t=signed",
      nowMs
    ),
    "https://media.licdn.com/dms/image/company-logo?e=1786838401&v=beta&t=signed"
  );
});

test("normalizes stable Harper-hosted company logos", () => {
  assert.equal(
    getDisplayableCompanyLogoUrl(
      "https://matchharper.com/images/company-logo.png"
    ),
    "/images/company-logo.png"
  );
  assert.equal(getDisplayableCompanyLogoUrl(null), null);
});

test("accepts company_db logos only from Harper Supabase public storage", () => {
  const storageLogo =
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/tavus.jpg";

  assert.equal(getHarperSupabaseStorageImageUrl(storageLogo), storageLogo);
  assert.equal(
    getHarperSupabaseStorageImageUrl(
      "https://media.licdn.com/dms/image/company-logo"
    ),
    null
  );
  assert.equal(
    getHarperSupabaseStorageImageUrl(
      "https://another-project.supabase.co/storage/v1/object/public/company_logo/logo.png"
    ),
    null
  );
  assert.equal(
    getHarperSupabaseStorageImageUrl(
      "https://zzojrniuppueizhnmqfd.supabase.co/not-public/logo.png"
    ),
    null
  );
});

test("falls back to the workspace logo when company_db logo is external", () => {
  const workspaceLogo =
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/world-labs.svg";

  assert.equal(
    resolveCompanyLogoUrl({
      companyDbLogoUrl:
        "https://media.licdn.com/dms/image/company-logo?e=1781740800",
      workspaceLogoUrl: workspaceLogo,
    }),
    workspaceLogo
  );
});

test("keeps a Harper Storage company_db logo ahead of the workspace logo", () => {
  const companyDbLogo =
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/company-db.svg";

  assert.equal(
    resolveCompanyLogoUrl({
      companyDbLogoUrl: companyDbLogo,
      workspaceLogoUrl:
        "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/workspace.svg",
    }),
    companyDbLogo
  );
});
