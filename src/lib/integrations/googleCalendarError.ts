export class GoogleCalendarError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

export function connectionChangedError() {
  return new GoogleCalendarError(
    409,
    "CONNECTION_CHANGED",
    "다른 요청에서 연결 상태가 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요."
  );
}
