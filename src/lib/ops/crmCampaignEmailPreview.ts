export const EMPTY_CRM_CAMPAIGN_PREVIEW_HTML =
  '<div style="padding:20px;border:1px dashed #cbd5e1;color:#94a3b8;text-align:center;">캠페인 HTML 미리보기</div>';

export function buildCrmCampaignPreviewDocument(htmlContent: string) {
  const campaignHtml = htmlContent.trim()
    ? htmlContent
    : EMPTY_CRM_CAMPAIGN_PREVIEW_HTML;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #f5f5f4; color: #171717; }
      body { padding: 24px 14px; font-family: Arial, Helvetica, sans-serif; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; }
      .mail { max-width: 640px; margin: 0 auto; background: #ffffff; padding: 28px; }
      .body { font-size: 14px; line-height: 1.4; }
      .placement { margin-top: 24px; }
      .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; line-height: 1.6; color: #6b7280; }
      .footer p { margin: 12px 0; }
      .footer a { color: #6b7280; }
    </style>
  </head>
  <body>
    <main class="mail">
      <section class="body">
        <p>안녕하세요, 최근 프로필과 선호를 바탕으로 새로운 기회를 정리했습니다.</p>
        <p>실제 periodic refresh 이메일 본문과 추천 링크가 이 위치까지 표시됩니다.</p>
      </section>
      <section class="placement">${campaignHtml}</section>
      <footer class="footer">
        <p>If you have any issues, feedback, or want someone on the team to take a look, email <a href="mailto:chris@matchharper.com">chris@matchharper.com</a>. Harper is still learning, so it can make mistakes or get details wrong.</p>
        <p>If you would like to change how often Harper emails you or stop receiving emails entirely, just reply to this email.</p>
      </footer>
    </main>
  </body>
</html>`;
}

const BROADCAST_FOOTERS = {
  en: [
    "If you have any issues, feedback, or want someone on the team to take a look, email chris@matchharper.com. Harper is still learning, so it can make mistakes or get details wrong.",
    "If you would like to change how often Harper emails you or stop receiving emails entirely, just reply to this email.",
  ],
  ko: [
    "문의나 피드백이 있거나 Harper 팀의 확인이 필요하면 chris@matchharper.com으로 알려주세요. Harper는 아직 배우는 중이라 실수하거나 일부 정보를 잘못 안내할 수 있습니다.",
    "메일 수신 빈도를 바꾸거나 메일을 완전히 중단하려면 이 메일에 답장해 주세요.",
  ],
} as const;

export function buildCrmBroadcastPreviewDocument(
  htmlContent: string,
  locale: "ko" | "en" = "ko"
) {
  const bodyHtml = htmlContent.trim()
    ? htmlContent
    : '<div style="padding:20px;border:1px dashed #cbd5e1;color:#94a3b8;text-align:center;">단체 메일 본문 미리보기</div>';
  const footerHtml = BROADCAST_FOOTERS[locale]
    .map(
      (paragraph) =>
        `<p>${paragraph.replace(
          "chris@matchharper.com",
          '<a href="mailto:chris@matchharper.com">chris@matchharper.com</a>'
        )}</p>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #f5f5f4; color: #171717; }
      body { padding: 24px 14px; font-family: Arial, Helvetica, sans-serif; }
      img { max-width: 100%; height: auto; }
      table { border-collapse: collapse; }
      .mail { max-width: 640px; margin: 0 auto; background: #ffffff; padding: 28px; }
      .body { font-size: 14px; line-height: 1.4; overflow-wrap: break-word; }
      .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; line-height: 1.6; color: #6b7280; }
      .footer p { margin: 12px 0; }
      .footer a { color: #6b7280; }
    </style>
  </head>
  <body>
    <main class="mail">
      <section class="body">${bodyHtml}</section>
      <footer class="footer">${footerHtml}</footer>
    </main>
  </body>
</html>`;
}
