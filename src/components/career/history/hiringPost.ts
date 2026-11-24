import type { useCareerT } from "@/i18n/useCareerT";
import type { CareerHistoryOpportunity } from "../types";

type CareerTHelper = ReturnType<typeof useCareerT>;

// A hiring post is a social post in which someone at the company says they
// are hiring (for example on LinkedIn). It is stored like any external
// posting; only its label, button and contact guidance differ.
export const isHiringPostOpportunity = (
  item: Pick<CareerHistoryOpportunity, "hiringPost" | "isInternal" | "sourceType">
) => !item.isInternal && item.sourceType !== "internal" && Boolean(item.hiringPost);

export const getHiringPostLabel = (t: CareerTHelper) =>
  t("career.history.hiring_post.label", "채용 글");

export const getHiringPostApplyLabel = (t: CareerTHelper) =>
  t("career.history.hiring_post.reach_out", "연락해 볼래요");

// External opportunities share one card. Only the source-specific label and
// primary action differ: an official posting, a hiring post, or a company
// recommended as a company itself, whether or not it posts a fitting role.
export const isCompanyOpportunity = (
  item: Pick<CareerHistoryOpportunity, "targetKind">
) => item.targetKind === "company";

export const getExternalOpportunityLabel = (
  item: Pick<CareerHistoryOpportunity, "hiringPost" | "isInternal" | "sourceType" | "targetKind">,
  t: CareerTHelper
) =>
  isCompanyOpportunity(item)
    ? t("career.history.hiring_post.1fnb2v7", "회사")
    : isHiringPostOpportunity(item)
      ? getHiringPostLabel(t)
      : t("career.history.new_opportunity_list.open_positions", "직접 지원");

export const getExternalOpportunityApplyLabel = (
  item: Pick<CareerHistoryOpportunity, "hiringPost" | "isInternal" | "sourceType" | "targetKind">,
  t: CareerTHelper
) =>
  isCompanyOpportunity(item)
    ? t("career.history.hiring_post.0q0a4bv", "합류 방법 찾기")
    : isHiringPostOpportunity(item)
      ? getHiringPostApplyLabel(t)
      : t("career.history.external_application.apply", "지원하기");

// A company opportunity goes straight to Harper: the way in (an open role,
// a talent pool, a person to contact, waiting for an opening) is Harper's call.
export const getCompanyJoinRequestText = (opportunity: string, t: CareerTHelper) =>
  t(
    "career.history.external_opportunity_apply_modal.05q2dvh",
    "{opportunity}에 합류하기 위해 지금 할 수 있는 가장 좋은 방법을 찾아서 준비해줘.",
    { values: { opportunity } }
  );

/** One plain sentence on how the post asks people to get in touch. */
export function getHiringPostContactText(
  item: Pick<CareerHistoryOpportunity, "hiringPost">,
  t: CareerTHelper
) {
  const post = item.hiringPost;
  if (!post) return null;
  switch (post.contactMethod) {
    case "email":
      return post.contactEmail
        ? t(
            "career.history.hiring_post.contact_email",
            "글에 적힌 이메일({email})로 연락해 달라고 했어요.",
            { values: { email: post.contactEmail } }
          )
        : t(
            "career.history.hiring_post.contact_email_unknown",
            "이메일로 연락해 달라고 했어요."
          );
    case "message":
      return t(
        "career.history.hiring_post.contact_message",
        "작성자에게 메시지를 보내 달라고 했어요."
      );
    case "comment":
      return t(
        "career.history.hiring_post.contact_comment",
        "글에 댓글로 관심을 남겨 달라고 했어요."
      );
    case "apply_link":
      return t(
        "career.history.hiring_post.contact_apply_link",
        "글에 지원 링크가 있어요."
      );
    default:
      return t(
        "career.history.hiring_post.contact_unknown",
        "연락 방법은 따로 적혀 있지 않아요."
      );
  }
}
