import { careerT } from "@/lib/career/translatedCareerMessage";
import { getCareerLanguageSettingToolStatus } from "@/lib/talentOnboarding/languageSettingTool";

export function getCareerToolStartThinkingLog(
  toolName: string,
  locale?: string | null,
  input?: Record<string, unknown>
) {
  switch (toolName) {
    case "update_language_setting":
      return getCareerLanguageSettingToolStatus(input?.language);
    case "update_setting":
      return careerT(
        locale,
        "career.chat.tool.update_setting.start",
        "추천 발송 설정을 업데이트하고 있습니다."
      );
    case "update_talent_profile":
      return careerT(
        locale,
        "career.chat.tool.update_talent_profile.start",
        "프로필 정보를 업데이트하고 있습니다."
      );
    case "list_documents":
      return careerT(
        locale,
        "career.chat.tool.list_documents.start",
        "저장된 문서를 확인하고 있습니다."
      );
    case "read_document":
      return careerT(
        locale,
        "career.chat.tool.read_document.start",
        "문서 내용을 확인하고 있습니다."
      );
    case "upsert_document":
      return careerT(
        locale,
        "career.chat.tool.update_document.start",
        "문서 정보를 업데이트하고 있습니다."
      );
    case "open_url": {
      const host = urlHost(input?.url);
      return host
        ? careerT(locale, "career.chat.tool.open_url.host", "{host} 읽는 중", {
            values: { host },
          })
        : careerT(
            locale,
            "career.chat.tool.open_url.start",
            "공유된 링크 내용을 확인하고 있습니다."
          );
    }
    case "web_search": {
      const query =
        typeof input?.query === "string"
          ? input.query.replace(/\s+/g, " ").trim().slice(0, 80)
          : "";
      return query
        ? careerT(
            locale,
            "career.chat.tool.web_search.query",
            '"{query}" 검색 중',
            {
              values: { query },
            }
          )
        : "";
    }
    case "internal_role_priority_review":
      return careerT(
        locale,
        "career.chat.tool.internal_role_priority_review.start",
        "관심 있는 내부 기회를 확인하고 있습니다."
      );
    case "record_internal_fit_reevaluation_information":
    case "request_internal_role_reconsideration":
      return careerT(
        locale,
        "career.chat.tool.record_internal_fit_reevaluation_information.start",
        "추가로 알려주신 정보를 반영하고 있습니다."
      );
    case "contact_company":
      return careerT(
        locale,
        "career.chat.tool.record_company_request_response.start",
        "회사에 전할 답변을 정리하고 있습니다."
      );
    default:
      return "";
  }
}

function urlHost(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
