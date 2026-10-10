// Erro de negócio com status e código: o Fastify responde { statusCode, code, error, message }.
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
