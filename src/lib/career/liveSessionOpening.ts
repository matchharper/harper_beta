/** Start actual backend work; a commentary append only asks the voice model to speak. */
export function buildLiveSessionOpeningEvents() {
  return [
    {
      type: "response.item.create",
      item: {
        type: "message",
        role: "developer",
        content: [
          {
            type: "input_text",
            text: "The caller has started the call. Use the call's opening guidance and verified context to prepare the first useful conversational turn now, including any tools needed. Return the prepared opening and question so the voice frontend can begin, then listen. An acknowledgment that you will prepare something is not the completed opening.",
          },
        ],
      },
    },
    { type: "response.create" },
  ];
}
