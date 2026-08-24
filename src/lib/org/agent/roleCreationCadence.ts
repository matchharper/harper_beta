export function shouldAttachRoleCreationConfirmation(args: {
  assistantText: string;
  confirmationRequested: boolean;
  notificationSaved: boolean;
  roleWasDraft: boolean;
  surface: "chat" | "slack";
}) {
  return (
    args.surface === "slack" &&
    args.roleWasDraft &&
    args.notificationSaved &&
    !args.confirmationRequested &&
    /(마지막\s*설정|final\s+settings?)/i.test(args.assistantText)
  );
}
