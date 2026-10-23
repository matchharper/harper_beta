/**
 * Living areas (생활권) for onsite and hybrid Roles. A city outside this table
 * is not known, and an unknown city is kept as "확인 안 됨" rather than removed.
 * Keys are lowercase English city names as written by the location facets.
 */
const REGIONS: Record<string, string[]> = {
  "kr-capital": [
    "seoul", "incheon", "seongnam", "bundang", "pangyo", "suwon", "yongin", "goyang", "ilsan", "bucheon",
    "anyang", "hwaseong", "dongtan", "namyangju", "gimpo", "hanam", "gwacheon", "uijeongbu", "paju",
    "siheung", "gwangmyeong", "ansan", "guri", "osan", "pyeongtaek", "icheon", "gunpo", "uiwang",
    "yangju", "pocheon", "gwangju-si", "hwado", "dongducheon", "anseong", "yeoju", "gapyeong", "yangpyeong",
  ],
  "kr-southeast": ["busan", "ulsan", "changwon", "gimhae", "yangsan", "geoje", "jinju", "tongyeong", "miryang"],
  "kr-daegu": ["daegu", "gumi", "pohang", "gyeongsan", "gyeongju", "andong", "chilgok"],
  "kr-chungcheong": ["daejeon", "sejong", "cheongju", "cheonan", "asan", "chungju", "seosan", "dangjin"],
  "kr-honam": ["gwangju", "jeonju", "suncheon", "yeosu", "mokpo", "gunsan", "iksan", "naju"],
  "kr-gangwon": ["chuncheon", "wonju", "gangneung", "sokcho"],
  "kr-jeju": ["jeju", "seogwipo"],
};

const CITY_TO_REGION = new Map(
  Object.entries(REGIONS).flatMap(([region, cities]) => cities.map((city) => [city, region] as const))
);

export function regionOfCity(city: string | null | undefined) {
  return city ? CITY_TO_REGION.get(city.trim().toLowerCase()) ?? null : null;
}

/** Every known city in the same living areas as the given cities. */
export function sameAreaCities(cities: string[]) {
  const regions = new Set(cities.map(regionOfCity).filter(Boolean));
  const allowed = new Set(cities.map((city) => city.trim().toLowerCase()));
  for (const [city, region] of CITY_TO_REGION) if (regions.has(region)) allowed.add(city);
  return [...allowed];
}

export const KNOWN_CITIES = [...CITY_TO_REGION.keys()];

/** Countries of the known cities (region keys start with the ISO country code). */
export function countriesOfCities(cities: string[]) {
  return [
    ...new Set(
      cities.flatMap((city) => {
        const region = regionOfCity(city);
        return region ? [region.split("-")[0]!.toUpperCase()] : [];
      })
    ),
  ];
}
