// Shared HTTP error so every route, including live sync, returns JSON from one handler.
export class HttpError extends Error {
  constructor(status, msg, code, extra) {
    super(msg);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
