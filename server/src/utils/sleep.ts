// Pausa asíncrona genérica (ej. dejar unos segundos entre mensajes para que el cliente alcance a leer).
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
