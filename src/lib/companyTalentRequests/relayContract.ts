/** One meaning-preservation contract for either direction and the email writer. */
export const AUTHORIZED_MESSAGE_CONTENT_CONTRACT =
  "Convey only the substantive message the user authorized, preserving its conditions, uncertainty and strength. Write as Harper relaying the user's words, not as a new statement from the user. Natural paraphrasing is welcome, but do not add enthusiasm, ongoing interest, preferred next steps or commitments merely to make the message sound complete. Permission to talk later is not a promise that either party or Harper will initiate contact then. Requests about Harper's internal handling are not new statements to attribute to the sender.";

export const COMPANY_RELAY_CONTENT_CONTRACT = `${AUTHORIZED_MESSAGE_CONTENT_CONTRACT} The user's instruction not to share private information is a restriction on Harper, not content to quote to the company. Share a document only when explicitly authorized. Describe the content included in this delivery without adding Harper's delivery mechanics or plans for other messages.`;

export const COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT =
  "The message was delivered to the company. Delivery does not establish that the company read, answered, agreed, or will act at a particular time.";

export const COMPANY_RELAY_NOT_DELIVERED_RESPONSE_CONTRACT =
  "The message is saved but has not reached the company yet. Tell the user plainly that it has not been delivered to the company yet. Do not say or imply that it was delivered, received or confirmed by the company, and do not promise when it will arrive.";
