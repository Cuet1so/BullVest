// Bounds the UI wait; it does not cancel or retry an operation on the server.
export async function withTimeout<T>(operation: PromiseLike<T>, milliseconds = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('La consulta ha tardado demasiado. Comprueba la conexión.')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
