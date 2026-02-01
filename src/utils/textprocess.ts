const MIN_CHUNK_LEN = 15;

const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "etc",
  "e.g",
  "i.e",
]);

const isSentenceBoundary = (text: string, idx: number): boolean => {
  const ch = text[idx];
  if (!/[.!?]/.test(ch)) return false;

  // Ellipsis "..." -> not a boundary
  if (ch === "." && text.slice(idx, idx + 3) === "...") return false;

  const prev = text[idx - 1] ?? "";
  const next = text[idx + 1] ?? "";

  // Decimal numbers like 3.14
  if (ch === "." && /\d/.test(prev) && /\d/.test(next)) return false;

  // Abbreviations like "Mr.", "Dr."
  if (ch === ".") {
    const before = text.slice(0, idx).trimEnd();
    const lastSpace = before.lastIndexOf(" ");
    const word = before
      .slice(lastSpace + 1)
      .toLowerCase()
      .replace(/[^a-z.]/g, "");
    if (ABBREVIATIONS.has(word)) return false;
  }

  return true;
};

export const splitTextToChunks = (text: string): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < trimmed.length; i++) {
    if (!isSentenceBoundary(trimmed, i)) continue;

    const end = i + 1;
    const rawtext = trimmed.slice(start, end).trim();
    if (rawtext) sentences.push(rawtext);

    let j = end;
    while (j < trimmed.length && /\s/.test(trimmed[j])) j++;
    start = j;
    i = j - 1;
  }

  if (start < trimmed.length) {
    const last = trimmed.slice(start).trim();
    if (last) sentences.push(last);
  }

  const chunks: string[] = [];
  let buf = "";

  for (const s of sentences) {
    if (buf.length < MIN_CHUNK_LEN) {
      buf = buf + " " + s;
    } else {
      chunks.push(buf.trim());
      buf = s;
    }
  }
  if (buf.length > 0) {
    if (buf.length < MIN_CHUNK_LEN) {
      const lastChunk = chunks[chunks.length - 1];
      const newChunk = lastChunk + " " + buf;
      chunks.push(newChunk.trim());
    } else {
      chunks.push(buf.trim());
    }
  }

  return chunks;
};

export function highlightDifferences(
  originalText: string,
  newText: string
): string {
  // 1. 문장을 공백을 기준으로 단어 배열로 분리
  const originalWords = originalText
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const newWords = newText.split(/\s+/).filter((word) => word.length > 0);

  const result: string[] = [];
  let wrongWords = 0;

  let originIndex = 0;
  let newIndex = 0;
  while (originIndex < originalWords.length && newIndex < newWords.length) {
    const originalWord = originalWords[originIndex];
    const newWord = newWords[newIndex];

    if (originalWord === newWord) {
      result.push(newWord);
      originIndex += 1;
      newIndex += 1;
      continue;
    } else {
      wrongWords += 1;
      if (newWords.includes(originalWord)) {
        // 없는게 추가된 것.
        result.push(`<span class="text-red-700">${newWord}</span>`);
        newIndex += 1;
      } else if (originalWords.includes(newWord)) {
        // 있는걸 아예 빠뜨린 것.
        result.push(`<span class="text-red-700">(${originalWord})</span>`);
        originIndex += 1;
      } else {
        // 잘못 말한 것.
        result.push(`<span class="text-red-700">${newWord}</span>`);
        originIndex += 1;
        newIndex += 1;
      }
    }
  }

  return result.join(" ");
}

function diffWords(ref: string, hyp: string) {
  const R = ref.split(/\s+/);
  const H = hyp.split(/\s+/);

  const m = R.length;
  const n = H.length;

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (R[i - 1] === H[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // delete
          dp[i][j - 1] + 1, // insert
          dp[i - 1][j - 1] + 1 // substitute
        );
    }
  }

  // Backtrack
  let i = m,
    j = n;
  const ops: { type: string; ref?: string; hyp?: string }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && R[i - 1] === H[j - 1]) {
      ops.push({ type: "equal", ref: R[i - 1] });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: "delete", ref: R[i - 1] });
      i--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      ops.push({ type: "insert", hyp: H[j - 1] });
      j--;
    } else {
      ops.push({ type: "substitute", ref: R[i - 1], hyp: H[j - 1] });
      i--;
      j--;
    }
  }

  return ops.reverse();
}
export function highlightDifferences2(originalText: string, newText: string) {
  const ops = diffWords(
    originalText.replace(/\./g, "").trim(),
    newText.replace(/\./g, "").trim()
  );

  const result = ops.map((op) => {
    if (op.type === "equal") return op.ref;
    if (op.type === "insert")
      return `<span class="text-red-700">${op.hyp}</span>`;
    if (op.type === "delete")
      return `<span class="text-red-700">(${op.ref})</span>`;
    if (op.type === "substitute")
      return `<span class="text-red-700">${op.hyp}</span>`;
  });

  return result.join(" ");
}

export const buildLongDoc = (doc: any) => {
  const companies: string[] = []
  const exps = doc.experience_user?.map((exp: any, idx: number) => {
    let expText = `\n${idx + 1}. Role: ${exp.role}, Company: ${exp.company_db.name}`;
    if (exp.start_date) {
      expText += `, Started at: ${exp.start_date}`;
    }
    if (exp.end_date) {
      expText += exp.end_date ? `, Ended at : ${exp.end_date}` : ", Still working";
    }
    if (exp.description) {
      expText += `\nDescription of the experience: ${exp.description}`;
    }

    if (!companies.includes(exp.company_db.name)) {
      companies.push(exp.company_db.name);
      if (exp.company_db) {
        expText += `\n==== Company Info: ${exp.company_db.name} ====`;
      }
      if (exp.company_db.short_description) {
        expText += `\nShort description: ${exp.company_db.short_description}`;
      }
      if (exp.company_db.investors) {
        expText += `\nInvestors: ${exp.company_db.investors}`;
      }
      if (exp.company_db.specialities) {
        expText += `\nSpecialities: ${exp.company_db.specialities}`;
      }
      if (exp.company_db.founded_year && exp.company_db.founded_year > 0) {
        expText += `\nFounded at: ${exp.company_db.founded_year}`;
      }
      if (exp.employee_count_range) {
        expText += `\nEmployee count range: ${exp.employee_count_range["start"]}명 이상`;
        if (exp.employee_count_range["end"]) {
          expText += `, ${exp.employee_count_range["end"]}명 이하`;
        }
      }
    }
    return expText;
  });

  const educations = doc.edu_user?.map((edu: any, idx: number) => {
    let eduText = `${idx + 1}. School: ${edu.school}, Degree: ${edu.degree
      }, Field: ${edu.field}`;
    if (edu.start_date) {
      eduText += `, Start Date: ${edu.start_date}`;
    }
    if (edu.end_date) {
      eduText += `, End Date: ${edu.end_date ?? "Present"}`;
    }
    return eduText;
  });

  const publications = doc.publications
    ?.slice(0, 20)
    .map((pub: any, idx: number) => {
      return `\n${idx + 1}. Title: ${pub.title}, Published At: ${pub.published_at}`;
    });

  const awards = doc.extra_experience
    ?.slice(0, 20)
    .map((award: any, idx: number) => {
      return `${idx + 1}. Title: ${award.title}, Awarded At: ${award.awarded_at
        }`;
    });

  const bio = doc.bio ?? "";

  let docSummary = `Name: ${doc.name}`;
  if (doc.location) {
    docSummary += `\nLocation: ${doc.location}`;
  }
  if (doc.headline) {
    docSummary += `\nHeadline: ${doc.headline}`;
  }
  if (bio) {
    docSummary += `\nBio: ${bio}`;
  }
  if (doc.links) {
    docSummary += `\nPersonal Links: ${doc.links}`;
  }
  if (exps) {
    docSummary += `\nExperiences: ${exps}`;
  }
  if (educations) {
    docSummary += `\nEducations: ${educations}`;
  }
  if (publications) {
    docSummary += `\nPublications: ${publications}`;
  }
  if (awards) {
    docSummary += `\nAwards: ${awards}`;
  }

  return docSummary;
}

export const buildSummary = (doc: any) => {
  const exps = doc.experience_user?.map((exp: any, idx: number) => {
    let expText = `\n${idx + 1}. Role: ${exp.role}, Company: ${exp.company_db.name
      }`;
    if (exp.start_date) {
      expText += `, Start at: ${exp.start_date}`;
    }
    if (exp.end_date) {
      expText += exp.end_date ? `, Ended at : ${exp.end_date}` : ", Still working";
    }
    if (exp.description) {
      expText += `\nDescription of the experience: ${exp.description}`;
    }

    if (exp.company_db) {
      expText += `\n==== company info ====`;
    }
    if (exp.company_db.short_description) {
      expText += `\nShort description about the company: ${exp.company_db.short_description}`;
    }
    if (exp.company_db.investors) {
      expText += `\nInvestors of the company: ${exp.company_db.investors}`;
    }
    if (exp.company_db.specialities) {
      expText += `\nSpecialities of the company: ${exp.company_db.specialities}`;
    }
    if (exp.company_db.founded_year && exp.company_db.founded_year > 0) {
      expText += `\nFounded at: ${exp.company_db.founded_year}`;
    }
    return expText;
  });

  const educations = doc.edu_user?.map((edu: any, idx: number) => {
    let eduText = `${idx + 1}. School: ${edu.school}, Degree: ${edu.degree
      }, Field: ${edu.field}`;
    if (edu.start_date) {
      eduText += `, Start Date: ${edu.start_date}`;
    }
    if (edu.end_date) {
      eduText += `, End Date: ${edu.end_date ?? "Present"}`;
    }
    return eduText;
  });

  const publications = doc.publications
    ?.slice(0, 20)
    .map((pub: any, idx: number) => {
      return `${idx + 1}. Title: ${pub.title}, Published At: ${pub.published_at
        }`;
    });

  // const awards = doc.awards
  //   ?.slice(0, 20)
  //   .map((award: any, idx: number) => {
  //     return `${idx + 1}. Title: ${award.title}, Awarded At: ${
  //       award.awarded_at
  //     }`;
  //   });

  const bio = doc.bio ?? "";

  let docSummary = `Name: ${doc.name}`;
  if (doc.location) {
    docSummary += `\nLocation: ${doc.location}`;
  }
  if (bio) {
    docSummary += `\nBio: ${bio}`;
  }
  if (doc.headline) {
    docSummary += `\nHeadline: ${doc.headline}`;
  }
  if (exps) {
    docSummary += `\nExperiences: ${exps}`;
  }
  if (educations) {
    docSummary += `\nEducations: ${educations}`;
  }
  if (publications) {
    docSummary += `\nPublications: ${publications}`;
  }

  return docSummary;
};

export const dateToFormat = (dateStr?: string | null) => {
  if (!dateStr || dateStr === "Present") return "";

  // 정확히 YYYY-01-01 인 경우 → 연도만
  if (/^\d{4}-01-01$/.test(dateStr)) {
    return `${dateStr.slice(0, 4)}년`;
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";

  return d.toLocaleString("ko-KR", {
    month: "short",
    year: "numeric",
  });
};

export const dateToFormatLong = (dateStr: string) => {
  if (
    !dateStr ||
    dateStr === "Present" ||
    dateStr === null ||
    dateStr === undefined
  )
    return "";

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";

  const now = new Date();

  // 자정 기준으로 날짜만 비교
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffDays = (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";

  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const CLAUSE = [
  " group by ",
  " order by ",
  " limit ",
  " offset ",
  " having ",
  " union ",
  " intersect ",
  " except ",
];

export function fixUnbalancedParens(sql: string) {
  const applied: string[] = [];
  let s = sql;

  // 1) 문자열/주석을 무시하며 괄호 balance 스캔하기 위한 아주 간단한 상태머신
  const scanBalance = (text: string) => {
    let bal = 0;
    let inS = false; // '
    let inD = false; // "
    let inLine = false; // --
    let inBlock = false; // /* */
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const n = text[i + 1];

      if (inLine) {
        if (c === "\n") inLine = false;
        continue;
      }
      if (inBlock) {
        if (c === "*" && n === "/") {
          inBlock = false;
          i++;
        }
        continue;
      }

      if (!inS && !inD) {
        if (c === "-" && n === "-") {
          inLine = true;
          i++;
          continue;
        }
        if (c === "/" && n === "*") {
          inBlock = true;
          i++;
          continue;
        }
      }

      if (!inD && c === "'" && !inLine && !inBlock) {
        if (inS && n === "'") {
          i++;
          continue;
        }
        inS = !inS;
        continue;
      }
      if (!inS && c === '"' && !inLine && !inBlock) {
        inD = !inD;
        continue;
      }

      if (inS || inD) continue;

      if (c === "(") bal++;
      else if (c === ")") bal--;
    }
    return bal;
  };

  // 2) 절 경계 키워드 앞에 닫는 괄호 삽입 시도
  // balance > 0이면 아직 열려있는 괄호가 있다는 뜻
  let bal = scanBalance(s);
  if (bal > 0) {
    const lower = s.toLowerCase();
    let bestIdx = -1;

    for (const kw of CLAUSE) {
      const idx = lower.indexOf(kw);
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
    }

    if (bestIdx !== -1) {
      // GROUP/ORDER/LIMIT 앞에 가능한 만큼 닫기
      const close = ")".repeat(bal);
      s = s.slice(0, bestIdx) + close + s.slice(bestIdx);
      applied.push(`inserted ${bal} ')' before clause boundary`);
      bal = scanBalance(s);
    }
  }

  // 3) 그래도 남아있으면 끝에 닫기
  if (bal > 0) {
    s = s + ")".repeat(bal);
    applied.push(`appended ${bal} ')' at end`);
  }

  return s;
}

function topLevelIndexOf(sql: string, needle: RegExp): number {
  let depth = 0;
  let inStr = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];

    // single-quoted string: handle escaped ''
    if (c === "'") {
      if (inStr && next === "'") {
        i++; // skip escaped quote
      } else {
        inStr = !inStr;
      }
      continue;
    }

    if (inStr) continue;

    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);

    if (depth === 0) {
      const m = needle.exec(sql.slice(i));
      if (m && m.index === 0) return i;
    }
  }

  return -1;
}

export function ensureGroupBy(sql: string, groupByClause: string): string {
  let s = sql
    .trim()
    .replace(/^```\w*\s*/, "") // 시작 부분의 ```와 언어 이름, 뒤따르는 공백/줄바꿈 제거
    .replace(/\s*```$/, "") // 끝 부분의 공백/줄바꿈과 ``` 제거
    .trim();
  const hasSemi = s.endsWith(";");
  if (hasSemi) s = s.slice(0, -1).trimEnd();

  s = fixUnbalancedParens(s);

  if (topLevelIndexOf(s.toLowerCase(), /group\s+by\b/) !== -1) {
    return hasSemi ? `${s};` : s;
  }

  const cut = topLevelIndexOf(s.toLowerCase(), /order\s+by\b/) ?? -1;

  const cut2 = topLevelIndexOf(
    s.toLowerCase(),
    /\blimit\b|\boffset\b|\bfetch\b|\bfor\b/
  );
  const insertAt = cut === -1 ? cut2 : cut2 === -1 ? cut : Math.min(cut, cut2);

  const out =
    insertAt === -1
      ? `${s}\n${groupByClause}`
      : `${s.slice(0, insertAt).trimEnd()}\n${groupByClause}\n${s
        .slice(insertAt)
        .trimStart()}`;

  const replaced = out.replace(
    /\bto_jsonb\s*\(\s*c\s*\)/g,
    `jsonb_build_object(
      'name', c.name,
      'investors', c.investors,
      'short_description', c.short_description
    )`
  );

  return replaced;
}

export const replaceName = (text: string, name: string) => {
  return text.replace(/<name>/g, name);
};

export const sqlRefine = (sql: string, ensure: boolean = false) => {
  let out = sql.trim()?.replace(/^```\w*\s*/, "")?.replace(/\s*```$/, "")?.trim().trim().replace(/\n/g, " ").trim();
  if (ensure) {
    const hasSemi = out.endsWith(";");
    if (hasSemi) out = out.slice(0, -1).trimEnd();
    out = fixUnbalancedParens(out);
    //   const final = `
    // ${out}
    // SELECT
    //   to_json(c.id) AS id,
    //   c.name,
    //   i.fts_rank
    // FROM identified_ids i
    // JOIN candid c ON c.id = i.id
    // ORDER BY i.fts_rank DESC`
    return out;
  }
  return out as string;
}