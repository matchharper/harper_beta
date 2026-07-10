type PreferredLocale = "ko" | "en" | string;

const EXACT_LOCATION_KO: Record<string, string> = {
  "mapo gu district, south korea": "대한민국 서울 마포구",
  "mapo-gu district, south korea": "대한민국 서울 마포구",
  "seongnam, south korea": "대한민국 성남",
  "seoul, south korea": "대한민국 서울",
  "seoul, korea": "대한민국 서울",
  "gyeonggi": "경기",
  "gyeonggi do": "경기",
  "gyeonggi-do": "경기",
  "gyeonggi, south korea": "대한민국 경기",
  "gyeonggi do, south korea": "대한민국 경기",
  "gyeonggi-do, south korea": "대한민국 경기",
};

const COUNTRY_KO: Record<string, string> = {
  "south korea": "대한민국",
  korea: "대한민국",
  "republic of korea": "대한민국",
  "korea, republic of": "대한민국",
  rok: "대한민국",
  "united states": "미국",
  "united states of america": "미국",
  usa: "미국",
  us: "미국",
  japan: "일본",
  singapore: "싱가포르",
};

const LOCATION_PART_KO: Record<string, string> = {
  seoul: "서울",
  busan: "부산",
  incheon: "인천",
  daegu: "대구",
  daejeon: "대전",
  gwangju: "광주",
  ulsan: "울산",
  sejong: "세종",
  gyeonggi: "경기",
  "gyeonggi do": "경기",
  "gyeonggi-do": "경기",
  seongnam: "성남",
  pangyo: "판교",
  suwon: "수원",
  yongin: "용인",
  jeju: "제주",
  remote: "원격",
  "new york": "뉴욕",
  nyc: "뉴욕",
  "new york city": "뉴욕",
  "san francisco": "샌프란시스코",
  "bay area": "베이 에어리어",
  california: "캘리포니아",
  ca: "캘리포니아",
  tokyo: "도쿄",
  singapore: "싱가포르",
};

const normalizeLocationKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ");

const normalizeSegmentKey = (value: string) =>
  normalizeLocationKey(value).replace(/-/g, " ");

const translateLocationPart = (value: string) => {
  const key = normalizeSegmentKey(value);
  return LOCATION_PART_KO[key] ?? COUNTRY_KO[key] ?? value.trim();
};

const getExactLocationKo = (value: string) => {
  const key = normalizeLocationKey(value);
  return EXACT_LOCATION_KO[key] ?? COUNTRY_KO[key] ?? null;
};

const translateCommaSeparatedLocation = (value: string) => {
  const exact = getExactLocationKo(value);
  if (exact) return exact;

  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return translateLocationPart(value);
  }

  const country = COUNTRY_KO[normalizeSegmentKey(parts[parts.length - 1])];
  if (country) {
    return [
      country,
      ...parts.slice(0, -1).map((part) => translateLocationPart(part)),
    ].join(" ");
  }

  return parts.map((part) => translateLocationPart(part)).join(", ");
};

const translateEnglishLocationToKo = (value: string) => {
  const exact = getExactLocationKo(value);
  if (exact) return exact;

  const chunks = value.split(/(\s+-\s+|\s*[/;|]\s*)/);
  if (chunks.length === 1) {
    return translateCommaSeparatedLocation(value);
  }

  return chunks
    .map((chunk) =>
      /^\s*(?:-\s*|[/;|])\s*$/.test(chunk)
        ? chunk
        : translateCommaSeparatedLocation(chunk)
    )
    .join("");
};

export const formatCareerLocation = (
  location: string | null | undefined,
  preferredLocale: PreferredLocale
) => {
  const value = location?.trim();
  if (!value) return null;
  if (preferredLocale !== "ko") return value;
  return translateEnglishLocationToKo(value);
};
