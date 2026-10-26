/** Expected browser errors are safe to show without exposing host internals. */
export class WebRequestError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422 = 409,
  ) {
    super(message);
  }
}
