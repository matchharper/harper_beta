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
