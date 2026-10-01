import type { OrgLocale } from "@/i18n/org/locale";

// Headquarters is free text in company_db.location. A missing or ambiguous
// location follows the product's non-Korean default.
export function localeFromHeadquarters(location: unknown): OrgLocale {
  const value = String(location ?? "").trim();
  if (!value) return "en";
  if (
    /north korea|democratic people.s republic of korea|korea, democratic people.s republic|북한|조선민주주의인민공화국/i.test(
      value
    )
  )
    return "en";
  if (
    /(?:^|[^a-z])(?:south korea|republic of korea|korea, republic of|korea|seoul|busan|incheon|daejeon|daegu|gwangju|ulsan|seongnam|suwon|gyeonggi|gangwon|chungcheong|gyeongsang|jeolla|jeju)(?:$|[^a-z])/i.test(
      value
    )
  )
    return "ko";
  if (
    /(?:대한민국|한국|서울|부산|인천|대전|대구|광주|울산|성남|수원|경기|강원|충청|경상|전라|제주)/.test(
      value
    )
  )
    return "ko";
  return "en";
}
