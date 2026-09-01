type OrgInviteEmailArgs = {
  companyName: string;
  inviteUrl: string;
  inviterEmail: string | null;
  inviterName: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function buildOrgInviteEmail(args: OrgInviteEmailArgs) {
  const companyName = args.companyName.replace(/\s+/g, " ").trim() || "회사";
  const inviterName = args.inviterName.replace(/\s+/g, " ").trim() || "팀 멤버";
  const inviterEmail = args.inviterEmail?.trim() || null;
  const inviterLabel =
    inviterEmail && inviterEmail.toLowerCase() !== inviterName.toLowerCase()
      ? `${inviterName} (${inviterEmail})`
      : inviterName;
  const subject = `${companyName}의 Harper Workspace에 초대되었어요`;
  const text = `안녕하세요.

${inviterLabel}님이 ${companyName}의 Harper Organization 워크스페이스에 초대했습니다.

Harper에서 팀과 함께 추천 인재를 검토하고 채용 진행 상황을 관리할 수 있습니다.

Organization 참여하기
${args.inviteUrl}

초대를 예상하지 못했다면 이 메일을 무시하셔도 됩니다.`;
  const safeCompanyName = escapeHtml(companyName);
  const safeInviterLabel = escapeHtml(inviterLabel);
  const safeInviteUrl = escapeHtml(args.inviteUrl);
  const html = `<!doctype html>
<html lang="ko">
  <body style="margin:0;background:#f5f5f3;color:#171717;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f3;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e8e5;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 12px;font-size:18px;font-weight:500;letter-spacing:-0.02em;">Harper</td>
            </tr>
            <tr>
              <td style="padding:12px 32px 36px;">
                <h1 style="margin:0 0 18px;font-size:20px;font-weight:600;line-height:1.35;letter-spacing:-0.035em;">${safeCompanyName}의 Workspace에<br>함께 참여해 주세요.</h1>
                <p style="margin:0 0 10px;font-size:15px;line-height:1.7;color:#454542;">${safeInviterLabel}님이 Harper Workspace에 초대했습니다.</p>
                <p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#73736f;">팀과 함께 추천 인재를 검토하고 채용 진행 상황을 한곳에서 관리할 수 있습니다.</p>
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="border-radius:8px;background:#171717;">
                      <a href="${safeInviteUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-size:14px;font-weight:400;text-decoration:none;">Workspace 참여하기</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#9a9a95;">버튼이 열리지 않으면 아래 링크를 브라우저에 붙여 넣어 주세요.</p>
                <p style="margin:4px 0 0;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${safeInviteUrl}" style="color:#73736f;text-decoration:underline;">${safeInviteUrl}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, subject, text };
}
