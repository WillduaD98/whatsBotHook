// Servicio de waId: normaliza números y extrae waId desde el cuerpo del webhook
// Evita duplicación de lógica en rutas/controladores y mejora la reutilización

// Normaliza un waId al formato esperado por el sistema
export function normalizeTo(waId: string) {
  // Caso México: a veces llega con prefijo 521 (13 dígitos) donde el '1' es indicativo
  if (waId.startsWith("521") && waId.length === 13) {
    // Retorna con prefijo 52 (quita el '1' para mantener consistencia interna)
    return "52" + waId.slice(3);
  }
  // Si no requiere normalización, devuelve el valor original
  return waId;
}

// Extrae y normaliza el waId desde el cuerpo estándar del webhook de WhatsApp
export function waIdFromBody(req: any): string {
  const value = req?.body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  const status = value?.statuses?.[0];
  const id = String(msg?.from || status?.recipient_id || "unknown");
  return normalizeTo(id);
}
