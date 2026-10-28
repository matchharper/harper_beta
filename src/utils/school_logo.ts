import { koreaUniversityEnToKo } from "./language_map";

export const SCHOOL_LOGO_MAP: Record<string, string> = {
  // Ivy / Top US
  "142423":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/yrDJxrp8kWrVegSOKAIKyVFaRqO1oLeAT51qGgXP6zgb-ifFrpG8yiguAalAao1s21eqdZgp2Jv8JPapjB9hDlaas3V_TLQOKFkEqcfeKbj6I-UiaIVpAnhpwmdodyUxo2LGmztWHN5D_8RRMiZ4VA.svg", // Harvard
  "1646":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/yrDJxrp8kWrVegSOKAIKyVFaRqO1oLeAT51qGgXP6zgb-ifFrpG8yiguAalAao1s21eqdZgp2Jv8JPapjB9hDlaas3V_TLQOKFkEqcfeKbj6I-UiaIVpAnhpwmdodyUxo2LGmztWHN5D_8RRMiZ4VA.svg", // Harvard
  "17919":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/owTXsc1QjzPSb9d2dEgquKY1J_INz4C2d-mkNnOHVtIQ3A64YQLGjT0Ja0MEoKL0sJHYilU6F7Ox1ThEX7VwXFe0KeUT3N-II_1lCw0K0Ovq0b69ZutoRAjEu7Ac3o7M62-O6GkhIOx0lfC2xvwFIg.svg", // Stanford
  "16396":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/0uWwEun2zGqrwpcC7JPhlNn6VRMn5m9dTS0NUVx0MUcUyGHEq6mt_TejCnIGyvGCWHHIh1Coceuq7EKqhorbe6Vja40mA7ZV0ry_XgY8R7G3ZC-5ImimJRKoD41RuyDW4bWhzjG8p7w8--_3ARcRKA.svg", // MIT
  "1503":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/0uWwEun2zGqrwpcC7JPhlNn6VRMn5m9dTS0NUVx0MUcUyGHEq6mt_TejCnIGyvGCWHHIh1Coceuq7EKqhorbe6Vja40mA7ZV0ry_XgY8R7G3ZC-5ImimJRKoD41RuyDW4bWhzjG8p7w8--_3ARcRKA.svg", // MIT
  "16504": "https://www.caltech.edu/favicon.ico", // Caltech
  "18951":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/mvMqi-XZj01YTf17uHnyoxSP-5o10un-ubdbH23cjLv--aoEag1dwSUJBDd9Pj1pp8XTFPGOI9ExEGEmPAAKoSmnzl_Rx-13bae_TxqFuPtN-3Gtm38StxOpEtL12NoFcxj3cVEL3E9yBqhPKcTQhA.svg", // Yale
  "19017": "https://www.princeton.edu/favicon.ico", // Princeton
  "16517": "https://www.brown.edu/favicon.ico", // Brown
  "18483": "https://www.dartmouth.edu/favicon.ico", // Dartmouth
  "16369": "https://www.cornell.edu/favicon.ico", // Cornell
  "19016": "https://www.upenn.edu/favicon.ico", // UPenn
  "2584":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/university_of_washington_logo.jpeg", // 워싱턴
  "3558":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/georgia_institute_of_technology_logo.jpeg", // 조지아텍
  "3147":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/carnegie_mellon_university_logo.jpeg", // CMU
  "3159":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/new_york_university_logo.jpeg", // 뉴욕대
  // "2477": "", // UCLA
  "3523":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/1631339899678.jpeg", // 코넬

  "14022":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/Cu_gVCIwkvNcl724fek5ZsHXLUTAsxo7lKHTYzjICbQdu65tJrGpJQf6kursNwBp5LCyO-yICGl4mc8oCpqdTFH8Ejf9M8AOSZeh5DKLkEshp2Xa99QAZlqtjjpOQ3NmjhnQ8uAdnM2LmSBiLJJAxQ.svg", // 칭와

  // ===== KOREA =====
  // SKY
  "15096106":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/_seoul_national_university__logo.jpeg", // 서울대학교
  "15094694":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/FHG4Ey_7SLSQVwGIOTSQCP1xL28mkvX6tg8sCiLR8Me7iNbrqHRVhoGGoQB3ITbE-SvoeUG3xtPTSJehL9ILCg.svg", // 고려대학교
  "15094718":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/8FCgNqlkK-QnA_6-52ZbfFJ_Wz_Gsm9zkPybokRMl8R0H4ZgUL0wu1lggVUIHhEwIxGXPOYR9gw9RDFxiW46Eg.svg", // 연세대학교

  // KAIST / POSTECH
  "15095344":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/_kaist__logo.jpeg", // KAIST
  "307477":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/IPFCAi7Dt0EWmbWufKX3scIyPwMaC5t3UNT_tAYQhDIN-1qHMugs2zwXn_ynoHvVRulXO4pphyXhtR9L_CWqcQ.svg", // POSTECH

  "15096944":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/1631342456738.jpeg", // 숭실대학교
  // 주요 사립
  "15096111":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/PZxl8Y2cZYVt3R1_3tVxKSNQ7h4WSbZtmdbmPzxw59W09Ax1v27xBADaT8PR5TGomW_KZ3bkCfZCJ0svImtNaw.svg", // 성균관대학교
  "15095335":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/_hvKM_qLHxIChA1mQEozNYTS61E-cvUOOMBG7GEZ3-yWeYTggdGm561yytIRybS_8ZoRqVMW-GVJgBhGrRqlGA.svg", // 한양대학교
  "19045":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/ayDlxOs9HFBzgePxztJKfSDiUuNd8B-9PcWMbTxBhr4kwAEqbHfVo9Cuahbfi-cLKW2VO3lJ47Wi52SBl-iaQg.svg", // 이화여자대학교
  "15096073":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/CAU_emblem.png", // 중앙대학교
  "15096107":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/images.png", // 서강대학교

  "15094702":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/Kyung_Hee_University_emblem.png", // 경희대
  "15096918":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/1631325367116.jpeg", // 이화여대
  "15095355":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/Pusan_National_University_logo.svg",
  "15094704":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/CI6s4C-G-x_bbkF4JnM-FPdd4mN7cJv3JY9LFMHMdgGtbepyrAm9Y8SPW4teh8fociKr3fxOEXAVXzNtbbYsftsmOzJLJ7bkyTbiAUPUTmfsw8Ub30o9LG_H85DXY0SSotc0dl3ydHIpbW2aROOOGQ.svg", // 경북대
  "15096090":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/DCP_bEDZkSqbZpRjp5A4MC3C33ImJjQNVuVaiOZpw7qpxG_k0HJ5xYdjmJ_5Xogz9m6FBCX0b3CwVLxVUoLD1Mx8e_SDw1J-u8D9MDgtNwDPfvRnVKZbaHBzqpBJ1yA4eAxu0_2vBaxHP8pD4Vw5mA.svg", // 홍익대
  "15095369":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/P8KVpbLKAkbNyQN2jlTMu_zF5pATodvRYiBMT0rvo7M3GKYl1WTFOQqIhpiquO41OVkVQ3XCaR4WHt64GMSkhA.svg",
  "15095321":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/MTCt22KZLTbB7e20aq4m97zF1gshi5JD7yfKawtqIdM-OvLv_IFNRiMYrWu4u-h6kBgY64eG_t_5x_lb9eZRnVRJJhowvUpa6BDxdyKZ4JqzXVHhl2QmBU0GPTzmM1jR2gGOyAlPmbv80oiy6i3aig.svg", // 전남대학교
  "15096079": "", // 동국대학교
  "15095343": "", // 국민대
  "15096088": "", // 한국외대

  // 과기/국립
  "19048":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/images%20(1).png", // UNIST
  "19049":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/images.jpeg", // DGIST
  "19050":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/images%20(2).png", // GIST

  "15094713":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/University_of_Seoul.svg.png", // 서울 시립대
  "15095338":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/nTa3C0QTCzGP4H8ELIXpHG4oBumuk181rcSti2k63myA-pLiH_WrVyLo4uyh1ovVafdEDxCGGYlHrWMgJFhLWzn6Ug0NtB6eTsdu_sRvXMcmfpLi-b7YvKo3sRYdoc26H2NLYGh4YUzX3fBQ1AXjXQ.svg", // 인하대
  "15096927":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/G_QgbTlQe3DiBqvmfyiYW_b20bRuTsLVYvRq8jqe66AYllKN63a6NyuWtGwAcmlnFfVdM-_HAvPB0KsdJgWXU7PQU-Deoh8vNIL4EL0mqLAfG6FoB3zqlIxcUYGYuUWD302BkVSA_T52ysHu_9aYng.svg", // 건국대
  "15095359":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/bU99YzMkHC2ylEDH_qU5d3QJy6mggOqJSrEq2kv7_6DxNy3BaaHkpWWsVnTQc3s_oEtbeNNsPFeu_POC_iD7OHSqsJdQGBQcXcixDfHwkA6ggyQM7rlTAuIqZYYZ-qMT2zd01ICKFI3yT_v_MMdbCw.svg", // 서울여대
  "15094680":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/Jfg9IwFePrY37SVSK9RiKQ_z21CDmClwc8zVr6xJCBd82W-MTRWr1jqjv2AgXBXNEOCKEuWuFxPU_GtSva5PvA.svg", // 한국 항공대
  "15094701":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/_logo.jpeg", // 경기대학교
  "15094663":
    "https://zzojrniuppueizhnmqfd.supabase.co/storage/v1/object/public/company_logo/1631375602419.jpeg", // 아주대학교
};

// Reuse the existing logo assets for name-only education records. Korean/English
// aliases are resolved by the same university-name map used elsewhere in profiles.
const SCHOOL_NAME_IDS = new Map<string, string>([
  ["서울대학교", "15096106"],
  ["고려대학교", "15094694"],
  ["연세대학교", "15094718"],
  ["한국과학기술원(kaist)", "15095344"],
  ["포항공과대학교(postech)", "307477"],
  ["숭실대학교", "15096944"],
  ["성균관대학교", "15096111"],
  ["한양대학교", "15095335"],
  ["이화여자대학교", "19045"],
  ["중앙대학교", "15096073"],
  ["서강대학교", "15096107"],
  ["경희대학교", "15094702"],
  ["부산대학교", "15095355"],
  ["경북대학교", "15094704"],
  ["홍익대학교", "15096090"],
  ["전남대학교", "15095321"],
  ["울산과학기술원(unist)", "19048"],
  ["대구경북과학기술원(dgist)", "19049"],
  ["광주과학기술원(gist)", "19050"],
  ["서울시립대학교", "15094713"],
  ["인하대학교", "15095338"],
  ["건국대학교", "15096927"],
  ["서울여자대학교", "15095359"],
  ["한국항공대학교", "15094680"],
  ["경기대학교", "15094701"],
  ["아주대학교", "15094663"],
  ["harvard university", "142423"],
  ["stanford university", "17919"],
  ["massachusetts institute of technology", "16396"],
  ["mit", "16396"],
  ["california institute of technology", "16504"],
  ["caltech", "16504"],
  ["yale university", "18951"],
  ["princeton university", "19017"],
  ["brown university", "16517"],
  ["dartmouth college", "18483"],
  ["cornell university", "3523"],
  ["university of pennsylvania", "19016"],
  ["university of washington", "2584"],
  ["georgia institute of technology", "3558"],
  ["carnegie mellon university", "3147"],
  ["new york university", "3159"],
  ["tsinghua university", "14022"],
]);

export const getSchoolLogo = (
  url?: string | null,
  school?: string | null
): string | undefined => {
  // Preserve the more specific existing LinkedIn ID lookup, including URLs
  // carrying a query string or fragment.
  const schoolId = url?.trim().split(/[?#]/)[0].split("/").filter(Boolean).at(-1);
  const linkedLogo = schoolId ? SCHOOL_LOGO_MAP[schoolId] : undefined;
  if (linkedLogo) return linkedLogo;

  const name = school?.trim();
  if (!name) return undefined;
  const id = SCHOOL_NAME_IDS.get(koreaUniversityEnToKo(name).trim().toLowerCase());
  return id ? SCHOOL_LOGO_MAP[id] || undefined : undefined;
};
