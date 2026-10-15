export class OrgHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
