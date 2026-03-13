export class AppError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function assert(condition, statusCode, message, details = undefined) {
  if (!condition) {
    throw new AppError(statusCode, message, details);
  }
}
