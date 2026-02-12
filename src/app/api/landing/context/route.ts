import { NextRequest, NextResponse } from "next/server";

const parseLanguage = (acceptLanguage: string) => {
  const primaryLocale = acceptLanguage.split(",")[0]?.trim() || "en";
  const [rawLanguage, rawLocaleCountry] = primaryLocale.split("-");

  return {
    language: (rawLanguage || "en").toLowerCase(),
    localeCountry: (rawLocaleCountry || "").toUpperCase(),
  };
};

export async function GET(request: NextRequest) {
  const acceptLanguage = request.headers.get("accept-language") || "";
  const { language, localeCountry } = parseLanguage(acceptLanguage);

  const countryCode =
    request.headers.get("x-vercel-ip-country")?.toUpperCase() ||
    request.headers.get("cf-ipcountry")?.toUpperCase() ||
    localeCountry ||
    "ZZ";

  return NextResponse.json({
    countryCode,
    language,
    countryLang: `${countryCode}_${language}`,
  });
}
