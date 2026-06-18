type CareerTLike = (key: string, koSource: string) => string;

const fallbackCareerT: CareerTLike = (_key, koSource) => koSource;

export const getCareerLinkLabels = (t: CareerTLike) =>
  [
    t("career.common.constants.079mmhw", "링크드인"),
    "GitHub",
    "Google Scholar",
    t("career.common.constants.0iah44y", "개인 웹사이트"),
    "X.com",
  ] as const;

export const CAREER_LINK_LABELS = getCareerLinkLabels(fallbackCareerT);
