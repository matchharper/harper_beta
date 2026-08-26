const MAX_INITIAL_RESPONSE_INSTRUCTION_LENGTH = 6_000;

export function appendRealtimeInitialResponseInstruction(args: {
  initialResponseInstruction?: string | null;
  instructions: string;
}) {
  const initialResponseInstruction = String(
    args.initialResponseInstruction ?? ""
  )
    .trim()
    .slice(0, MAX_INITIAL_RESPONSE_INSTRUCTION_LENGTH);
  if (!initialResponseInstruction) return args.instructions;

  return [
    args.instructions,
    "## One-time instruction for the first assistant response",
    "Apply the following instruction only to the first assistant response immediately after this session connects. Keep every other session instruction active while following it. After that first response, ignore this section and continue with the normal session instructions and conversation state.",
    initialResponseInstruction,
  ].join("\n\n");
}
