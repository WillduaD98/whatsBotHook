[OPEN] Debug session: local-send-message-fails

## Síntoma
- En local, al intentar enviar un mensaje desde la UI, la operación falla.
- Sospecha inicial: `rate limit` o `auth` en `POST /messages/send`.

## Hipótesis iniciales
1. `POST /messages/send` está devolviendo `401` porque el token no se está enviando o ya no pasa `requireAuth`.
2. `POST /messages/send` está devolviendo `429` porque el nuevo `rateLimitByKey` ya se activó por la IP local.
3. El front sí manda la request, pero al endpoint/host equivocado, y la respuesta no viene del backend local esperado.
4. El controller `sendMessage` está rechazando el payload con `400` por validación de campos y la UI lo percibe como error genérico.
5. La llamada a WhatsApp/Meta falla aguas abajo y la UI lo está atribuyendo al envío local.

## Estado
- Pendiente recolectar evidencia runtime y confirmar la respuesta HTTP exacta de `POST /messages/send`.
