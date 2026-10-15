export const CAREER_DEV_EXTERNAL_FITS_PAGE_SIZE = 50;
export const CAREER_DEV_EXTERNAL_FITS_MONTHS = [1, 2, 3] as const;
export type CareerDevExternalFitsMonths =
  (typeof CAREER_DEV_EXTERNAL_FITS_MONTHS)[number];

export type CareerDevExternalFit = {
  roleId: string;
  companyName: string | null;
  roleName: string;
  score: number | null;
  checkedAt: string;
};

export type CareerDevExternalFitsPage = {
  items: CareerDevExternalFit[];
  totalCount: number;
  nextOffset: number | null;
};
