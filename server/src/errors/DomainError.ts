// Base de los errores de dominio: culpa de quien llama (4xx) con un mensaje seguro para mostrarle.
// El middleware errorHandler los convierte en la respuesta HTTP; todo lo demás sale como 500.

// Códigos HTTP que puede tener un error de dominio (nunca 5xx: eso es falla nuestra).
export type DomainErrorStatus = 400 | 403 | 404 | 409;

export class DomainError extends Error {
  constructor(
    message: string,
    readonly status: DomainErrorStatus,
    readonly code: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}
