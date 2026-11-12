/** Existing Harper email layout, shared with harper_worker/email_layout.py. */
const EMAIL_BODY_STYLE = [
  ".harper-email-body,.harper-email-body p,.harper-email-body pre,.harper-email-body li,.harper-email-body a{font-size:14px !important;line-height:1.4 !important;}",
  ".harper-email-body h2{font-size:16px !important;line-height:1.35 !important;}",
  ".harper-email-body h3{font-size:15px !important;line-height:1.4 !important;}",
  ".harper-email-body .harper-email-cta{font-size:12px !important;line-height:1.2 !important;}",
  ".harper-email-body .harper-email-footer,.harper-email-body .harper-email-footer p,.harper-email-body .harper-email-footer a{font-size:12px !important;line-height:1.6 !important;}",
  "@media only screen and (min-width: 600px){.harper-email-body,.harper-email-body p,.harper-email-body pre,.harper-email-body li,.harper-email-body a{font-size:14px !important;line-height:1.4 !important;}",
  ".harper-email-body h2{font-size:17px !important;line-height:1.35 !important;}",
  ".harper-email-body h3{font-size:16px !important;line-height:1.4 !important;}",
  ".harper-email-body .harper-email-cta{font-size:13px !important;line-height:1.25 !important;}",
  "}",
].join("");

export function wrapHarperEmailBody(html: string) {
  return `<div data-harper-email-body-container="true" style="width:100%;max-width:1024px;margin:0;box-sizing:border-box;word-break:keep-all;overflow-wrap:break-word;"><style>${EMAIL_BODY_STYLE}</style><div data-harper-email-body-content="true" class="harper-email-body" style="font-size:14px;line-height:1.4;">${html}</div></div>`;
}
