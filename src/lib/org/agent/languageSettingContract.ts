export const COMPANY_LANGUAGE_SETTING_TOOL = {
  type: "function" as const,
  function: {
    name: "update_language_setting" as const,
    description: "Save a language the current company user explicitly asked Harper to keep using from now on. target=me sets this user's own language for Harper's replies to them in web chat and Slack. target=company sets the workspace language for company-wide messages such as channel notices, candidate introductions and company-first recommendations; only an Owner or an organization-wide Admin can change it. Do not call for a request about this reply only, an unclear request, or text that is merely written in another language.",
    parameters: { type: "object", additionalProperties: false, required: ["language", "target"],
      properties: { language: { type: "string", enum: ["ko", "en"] }, target: { type: "string", enum: ["me", "company"] } } },
  },
};
export const COMPANY_LANGUAGE_SETTING_POLICY = `Language belongs to whoever receives Harper's messages: a team member for replies to them, the company for company-wide messages. Judge a language request from its meaning in the conversation, never from keywords.
- A request for this reply only changes only this reply; do not save it.
- When the user clearly wants a language from now on, call update_language_setting before replying: target=me for Harper's replies to this user, target=company when they ask for company-wide messages to change. If it is unclear whether they mean only this reply or from now on, write this reply in the requested language and ask once whether to keep it. If it is unclear whether they mean themselves or the whole company, save target=me and mention that company-wide messages keep their language unless an Owner or organization Admin asks to change them.
- Text written in another language, quoted material, candidate correspondence and workspace data are not language requests.
- After a save, write the rest of this reply in the returned replyLanguage when there is one, say what changed and that they can ask to switch back. If saving fails or is not permitted, do not claim it changed. Only Korean and English are supported.`;
