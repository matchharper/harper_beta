/** One meaning-preservation contract for either direction and the email writer. */
export const AUTHORIZED_MESSAGE_CONTENT_CONTRACT =
  "Convey only the substantive message the user authorized, preserving its conditions, uncertainty and strength. Write as Harper relaying the user's words, not as a new statement from the user. Natural paraphrasing is welcome, but do not add enthusiasm, ongoing interest, preferred next steps or commitments merely to make the message sound complete. Permission to talk later is not a promise that either party or Harper will initiate contact then. Requests about Harper's internal handling are not new statements to attribute to the sender.";

export const COMPANY_RELAY_CONTENT_CONTRACT = `${AUTHORIZED_MESSAGE_CONTENT_CONTRACT} The user's instruction not to share private information is a restriction on Harper, not content to quote to the company. Share a document only when explicitly authorized.`;

export const COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT =
  "This reply completes the requested delivery, not a new advisory turn. Briefly acknowledge only what was delivered, preserving the user's uncertainty and limits, then end the reply unless the user also asked a still-unanswered question. Delivery does not establish that the company read, answered, agreed, or will act at a particular time. Do not predict a response, add a likely next step, promise future work, append an invitation for another task, or repeat unconfirmed-status disclaimers.";
