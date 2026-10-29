# 🔥 PILOTO "DROGA DEL PAGO" — WhatsApp / TandaYa

**Para ejecutar HOY (jue 29 oct = DÍA 0).** Alineado al backend real en `server/src/`.
Stack: Graph API (`graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`), `es_MX`, `components`, axios, Mongo + máquina de estados por `conv.stage` + `conv.slots`.

---

## 0. Qué hay que crear — NADA está en tu repo, solo descrito aquí

> ⚠️ Este `.md` es **la especificación**. No modifiqué ni agregué archivos a tu repo. Los archivos de abajo son los que tú (o tu dev) crearían **cuando decidan** implementarlo.

**Archivos a crear (descripción):**
| Archivo | Qué haría |
|---|---|
| `server/src/models/ClienteCredito.ts` | Perfil del cliente: `limite`, `plazos[]`, `tasaSemanal`, `nivel`, `racha`, `renovaciones`. Se consulta por `waId`. |
| `server/src/models/RenovacionCita.ts` | Cita de renovación agendada por el bot (status `pendiente_confirmacion`). |
| `server/src/services/cuota.service.ts` | `calcularCuota({monto,plazoSemanas,tasaSemanal})` → cuota estimada. |
| `server/src/services/whatsappList.service.ts` | `sendList(...)` — Lista interactiva (para 4 plazos; WhatsApp solo deja 3 botones). |
| `server/src/flows/renovacion.flow.ts` | La máquina de estados `RENOVACION:*` (el flujo de renovación). |
| `server/src/flows/datosPago.flow.ts` | Entrega CLABE/referencia copiables (cada una en su mensaje, con etiqueta) al tocar "Pásame los datos". |

**Para implementar (cuando decidas):**
1. **3 ediciones a `webhookController.ts`** (descritas en §4) para enganchar los flujos.
2. **Poblar `ClienteCredito`** para tus clientes piloto (seed en §5). La DB hoy no tiene `limite/plazos/tasa/nivel/racha` — por eso ese modelo nuevo.

**Interés confirmado:** método **flat/add-on** (`cuota = (monto + monto·tasa·plazo) / plazo`) con **`tasaSemanal = 0.025`** (2.5% semanal = 10% por cada 4 semanas). Validado contra los números reales: $5,000 → 4 sem=$5,500 · 8 sem=$6,000 · 12 sem=$6,500 · (16 sem=$7,000). Es el método por default a usar. (Cambiable a francés con `METODO_INTERES=frances` si algún día se usa saldo decreciente.)

**Regla de Meta (ventana 24h):** fuera de 24h solo mandas **plantillas**. En cuanto el cliente toca un botón/responde, se abre la ventana y el flujo interactivo (botones + lista libres) funciona. Por eso el flujo de renovación arranca con el **botón de una plantilla**.

---

## 1. 🗣️ COPYWRITING "DE CALLE" (metáforas nuevas)

Hablas como el socio que le pasa mercancía al tendero, no como banco. Una acción por mensaje.

| Banco ❌ | Calle ✅ (TandaYa) |
|---|---|
| Saldo / adeudo | Tu flujo pendiente |
| Pago / abono semanal | Tu tanda de la semana |
| Pago vencido | Se te frenó el flujo / hora de reactivar |
| Monto del crédito | El impulso para tu negocio |
| Línea de crédito | Tu impulso disponible |
| Score / buró | Nivel de confianza |
| Renovación | Tu próximo impulso desbloqueado |
| Cliente al corriente | Racha activa 🔥 |

Niveles: `1 Arranque → 2 Constante → 3 Confianza → 4 Socio`. El **Nivel 3** es el que se promete como meta ("llega al 3").

---

## 2. 🛠️ PLANTILLAS META (3 toques del piloto)

Variables (consistentes): `{{1}}` Nombre · `{{2}}` Nivel · `{{3}}` Streak(semanas) · `{{4}}` Monto/Límite · `{{5}}` Fecha.
Crear en: Business Manager → WhatsApp Manager → Plantillas, **o** API `POST .../${WABA_ID}/message_templates`.

### Categorías
| Plantilla | Categoría | Uso |
|---|---|---|
| `streak_alert` | UTILITY | Día −1: recordatorio de racha/nivel + que mañana cierra ciclo. |
| `due_date_action` | UTILITY | Día 0: paga tu tanda de hoy (sin oferta → utility). |
| `prox_credito_gancho` | **MARKETING** | Día 0: el gancho de renovación (ofrece crédito/límite → marketing, requiere opt-in). **Este botón dispara el flujo interactivo.** |

### 2.1 `streak_alert` (UTILITY) — solo recordatorio
> Variables (en orden de aparición): `{{1}}` Nombre · `{{2}}` Monto del pago (con `$`, ej. `$750`) · `{{3}}` Fecha de vencimiento · `{{4}}` Racha (# pagos en tiempo y forma; **aparece 2 veces**, misma variable → se manda una sola vez: 4 parámetros).
> **Sin botones** y **sin datos de pago**: la CLABE/referencia solo se ofrecen el día del pago (`due_date_action`).
```json
{
  "name": "streak_alert", "language": "es_MX", "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Mañana toca tu pago" },
    { "type": "BODY",
      "text": "Hola {{1}}, mañana toca tu pago de *{{2}}* (vence *{{3}}*).\n\n🔥 Tu racha: {{4}}\n\n¡Llevas una racha de *{{4}} pagos en tiempo y forma*! 🔥 Así es como subes de nivel con TandaYa. No la sueltes 💪",
      "example": { "body_text": [["María López", "$750", "mañana, vie 30 oct", "6"]] } },
    { "type": "FOOTER", "text": "TandaYa, SOFOM E.N.R." }
  ]
}
```
**Payload de envío** (`streak_alert`):
```json
{
  "messaging_product": "whatsapp", "to": "52155XXXXXXXX", "type": "template",
  "template": { "name": "streak_alert", "language": { "code": "es_MX" },
    "components": [ { "type": "body", "parameters": [
      { "type": "text", "text": "María López" },
      { "type": "text", "text": "$750" },
      { "type": "text", "text": "mañana, vie 30 oct" },
      { "type": "text", "text": "6" }
    ] } ] }
}
```

### 2.2 `due_date_action` (UTILITY) ✅ dada de alta
> Variables (en orden de aparición): `{{1}}` Nombre · `{{2}}` Monto del pago (**con `$`**, ej. `$750`) · `{{3}}` Fecha de vencimiento · `{{4}}` Racha (# pagos en tiempo y forma; **aparece 2 veces** en el texto, pero es la misma variable → se manda **una sola vez**: 4 parámetros en total).> Es la **única** plantilla que ofrece los datos de pago (CLABE/referencia): solo el día del pago.
```json
{
  "name": "due_date_action", "language": "es_MX", "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "¡No rompas tu racha de pago!" },
    { "type": "BODY",
      "text": "Hola {{1}}, hoy toca tu pago 💪\n\nMonto del pago: {{2}}\nVence: {{3}}\n\n🔥 Tu racha: {{4}}\n\n¡Llevas una racha de {{4}} pagos en tiempo y forma! 🔥 Así es como subes de nivel con TandaYa. ¡Sigue así!",
      "example": { "body_text": [["William Duarte", "$750", "vie 29 de oct del 2026", "4"]] } },
    { "type": "BUTTONS", "buttons": [
      { "type": "QUICK_REPLY", "text": "Ya pagué ✅" },
      { "type": "QUICK_REPLY", "text": "Pásame los datos" },
      { "type": "QUICK_REPLY", "text": "Necesito ayuda" }
    ] }
  ]
}
```
**Payload de envío** (`due_date_action`):
```json
{
  "messaging_product": "whatsapp", "to": "52155XXXXXXXX", "type": "template",
  "template": { "name": "due_date_action", "language": { "code": "es_MX" },
    "components": [ { "type": "body", "parameters": [
      { "type": "text", "text": "William Duarte" },
      { "type": "text", "text": "$750" },
      { "type": "text", "text": "vie 29 de oct del 2026" },
      { "type": "text", "text": "4" }
    ] } ] }
}
```
> Botones (llegan como `type: "button"` con el texto como payload): `Ya pagué ✅` → flujo de comprobante · `Pásame los datos` → CLABE + referencia · `Necesito ayuda` → `stage: ASESOR`.

### 2.3 `prox_credito_gancho` (MARKETING) — dispara el flujo de renovación ✅ dada de alta
> Variables: `{{1}}` Nombre · `{{2}}` Racha (# pagos en tiempo y forma) · `{{3}}` Nivel · `{{4}}` Límite **sin `$`** (el `$` ya está en el texto: se manda `10,000`, no `$10,000`).
> Encabezado: **IMAGEN** → cada envío debe llevar su propia imagen (mediaId), igual que `ejemplo_comprobante_pago`.
```json
{
  "name": "prox_credito_gancho", "language": "es_MX", "category": "MARKETING",
  "components": [
    { "type": "HEADER", "format": "IMAGE" },
    { "type": "BODY",
      "text": "🔥 {{1}}, *¡Tu siguiente impulso te espera!*\n\n🔥 Por tu racha de *{{2}} pagos* en tiempo y forma, obtuviste el *Nivel {{3}}* con TandaYa y tu cofre digital está casi lleno. 🚀\n\nSi renuevas y llegas a *3 créditos seguidos bien pagados*, al tercero *subes* de nivel por tu buen comportamiento y te pueden abrir *mejores condiciones*.\n\n💰 Tu nuevo límite disponible: *${{4}}.*\n¿Listo para cargar tu siguiente Tanda?",
      "example": { "body_text": [["María López", "7", "2", "10,000"]] } },
    { "type": "BUTTONS", "buttons": [ { "type": "QUICK_REPLY", "text": "Calcular mi proximo credito" } ] }
  ]
}
```
> ⚠️ En Quick Reply de plantilla, WhatsApp regresa el **texto del botón** como payload (llega como `type: "button"`, no `"interactive"`). El webhook reconoce el botón por su texto con `isRenovEntry(...)`, comparando **sin mayúsculas ni acentos** ("Calcular mi proximo credito" = "Calcular mi próximo crédito").
> ⏳ Pendiente confirmar: texto exacto del botón (con/sin acentos), si lleva el footer `TandaYa, SOFOM E.N.R. Sujeto a aprobación.` (§7) y si la imagen del encabezado es siempre la misma.

### Payload de ENVÍO (ejemplo, `prox_credito_gancho`)
`POST https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`
```json
{
  "messaging_product": "whatsapp", "to": "52155XXXXXXXX", "type": "template",
  "template": { "name": "prox_credito_gancho", "language": { "code": "es_MX" },
    "components": [
      { "type": "header", "parameters": [ { "type": "image", "image": { "id": "<MEDIA_ID>" } } ] },
      { "type": "body", "parameters": [
        { "type": "text", "text": "María López" },
        { "type": "text", "text": "7" },
        { "type": "text", "text": "2" },
        { "type": "text", "text": "10,000" }
      ] }
    ] }
}
```

---

## 3. 🧠 EL FLUJO INTERACTIVO (lo que pediste, turno por turno)

Vive en `renovacion.flow.ts`. El cliente toca **"Calcular mi proximo credito"** en la plantilla → se abre la ventana de 24h → entra al flujo. Cada paso es un `stage`.
`racha` = **# de pagos en tiempo y forma** (no semanas), igual que en las plantillas.

```
[plantilla Día 0: botón "Calcular mi proximo credito"]
        │  (la plantilla ya mostró racha, nivel y límite → se salta la oferta)
        ▼  enterRenovacion()  → jala ClienteCredito por waId
                                                    stage: RENOVACION:monto
  "💰 ¿De cuánto te gustaría tu siguiente impulso?
   Tu límite es *{límite}*. Escríbeme el monto, por ejemplo *8000*."
        │ cliente escribe monto  →  VALIDA: número y ≤ límite
        │   (no es número: "Escríbeme solo el número, por ejemplo 8000")
        │   (si > límite: "Tu límite es {límite}, dame uno igual o menor 🙏")
        ▼                                           stage: RENOVACION:plazo
  Lista interactiva con SUS plazos (ej. [4][8][12][16] semanas)
  "📆 ¿En cuántas semanas lo quieres pagar?"  [Ver plazos]
        │ toca un plazo  →  VALIDA ∈ plazos del cliente
        ▼  calcularCuota(monto, plazo, tasaSemanal)   stage: RENOVACION:programar
  "Con *{monto}* a *{plazo} semanas*, tu tanda quedaría en *~{cuota}/semana* (estimado).
   ¡Continúa creciendo tu racha! Con 2 créditos más con buenas rachas subes al
   siguiente nivel y puedes desbloquear mejores opciones.
   ¿Quieres programar tu renovación?"
   [Sí, programar ✅] [Luego]
        │ Sí
        ▼                                           stage: RENOVACION:cita
  "Si hoy completas tu pago, mañana te agendamos la visita 📅
   ¿Agendamos tu cita de renovación para mañana?"
   [Sí, agéndala 📅] [Otro día]
        │ Sí  →  GUARDRAIL: re-valida monto≤límite y plazo∈plazos
        ▼
  Guarda RenovacionCita (pendiente_confirmacion, fecha = mañana)
  "¡Listo! 🙌 En unos momentos un asesor confirmará tu cita de mañana
   con *{monto}* a *{plazo} semanas* (cuota ~{cuota}).
   Primero completa tu pago de hoy 💪"
```

**Ejemplo (María López):** monto $8,000 a 8 semanas → (8,000 + 8,000·0.025·8) / 8 = **$1,200/semana**.

**Entrada por texto "renovar"** (sin haber tocado la plantilla): primero manda `RENOVACION:oferta` (racha, nivel, límite, plazos + `[Calcular 🧮] [Ahorita no]`) porque el cliente no vio la plantilla; "Calcular 🧮" → `RENOVACION:monto`.

**Salidas:**
| Botón / caso | Qué hace |
|---|---|
| `Ahorita no` / `Luego` | "Va, cuando quieras escribe *renovar* y lo retomamos 👌" → `stage: start` |
| `Otro día` | Igual que `Luego` **+** avisa a un asesor para agendar otra fecha |
| Abandona a medias | Se queda en `RENOVACION:*`; `menu` lo saca (barrido de 30 min opcional, §5.D) |

**Reglas duras (ya codeadas):**
- El monto **nunca** puede superar el `limite` del cliente (se valida al escribirlo y otra vez al agendar).
- El plazo **nunca** puede ser uno que no esté en `plazos` del cliente (la lista solo muestra los suyos; se re-valida al tocar y al agendar).
- La cita solo se guarda con monto/plazo que el bot ofreció. Si algo no cuadra → handoff a asesor, no se agenda.

---

## 4. 🔌 ENGANCHE: 2 ediciones a `webhookController.ts`

**Edición 1 — import** (junto a los otros `import ... from "../flows/...":`):
```ts
import { enterRenovacion, handleRenovacionFlow, isRenovEntry } from "../flows/renovacion.flow.js";
```

**Edición 2 — entrada + despacho.** Dentro de `processIncomingMessage`, pega el bloque de ENTRADA justo **después** del bloque `if (interactiveBtnId === "CLIENTE_SOY") {...}`, y el bloque de DESPACHO junto a `if (stage.startsWith("CLIENTE:")) {...}`:

```ts
// --- ENTRADA FLUJO RENOVACIÓN (botón de plantilla Día 0, o texto "renovar") ---
if (isRenovEntry(interactiveBtnId, interactiveBtnTitle)) {
  await enterRenovacion(waId, { slots: conv?.slots, senderPhoneNumberId: inboundPhoneNumberId });
  return;
}
if (type !== "interactive" && /^\s*renovar\s*$/i.test(text || "")) {
  await enterRenovacion(waId, { slots: conv?.slots, senderPhoneNumberId: inboundPhoneNumberId });
  return;
}

// --- DESPACHO FLUJO RENOVACIÓN ---
if (stage.startsWith("RENOVACION:")) {
  const renovResult = await handleRenovacionFlow({
    waId, stage, type, text, interactiveBtnId,
    slots: conv?.slots, senderPhoneNumberId: inboundPhoneNumberId
  });
  if (renovResult.goToMainMenu) { await sendMainMenu(); return; }
  if (renovResult.handled) return;
}
```
> `interactiveBtnTitle` ya existe en ese scope. No se necesita nada más: el parser de `button`/`interactive` (`button_reply`/`list_reply`) que ya tienes alimenta `interactiveBtnId`/`interactiveBtnTitle` y el `text` del monto.

**Edición 3 — botones de la plantilla `due_date_action` ("Pásame los datos" / "Ya pagué").**
Import (junto a los otros flows):
```ts
import { sendDatosPago, isDatosPagoBtn, isYaPagueBtn } from "../flows/datosPago.flow.js";
```
Routing (pégalo junto al bloque de ENTRADA de renovación, antes del despacho de stages):
```ts
// --- "Pásame los datos": CLABE + referencia copiables ---
if (type === "interactive" && isDatosPagoBtn(interactiveBtnId, interactiveBtnTitle)) {
  const ok = await sendDatosPago(waId, { senderPhoneNumberId: inboundPhoneNumberId });
  if (!ok) await enterClienteMenu(waId, { senderPhoneNumberId: inboundPhoneNumberId }); // fallback: verifica nº crédito
  return;
}
// --- "Ya pagué": entra al flujo de comprobante existente (pide confirmar nº de crédito) ---
if (type === "interactive" && isYaPagueBtn(interactiveBtnId, interactiveBtnTitle)) {
  await enterClienteMenu(waId, { senderPhoneNumberId: inboundPhoneNumberId });
  return;
}
```
> Datos opcionales de la cuenta por env: `BANCO_CUENTA` (default "BBVA México") y `TITULAR_CUENTA` (default "Inserex / TandaYa"). La CLABE y la referencia salen de tu modelo `Credit` (vía `ClienteCredito.numeroCredito`).
> Nota: "Ya pagué" reusa tu flujo `CLIENTE:*` verificado, que pide confirmar el número de crédito. Si lo quieres **de un solo toque** (sin pedir número, porque ya lo sabemos por `waId`), hay que ajustar `cliente.flow.ts` — dime y lo hago.

Compila: `cd server && npm run build` (o corre en dev con `npm run server:dev`).

---

## 5. 🚀 CHECKLIST DE EJECUCIÓN HOY

### A. Datos piloto — poblar `ClienteCredito` (CSV de Créditos en el panel)
Se carga con el **mismo CSV de Créditos** (panel → Créditos → Cargar CSV), agregando columnas opcionales del piloto:
```csv
numeroCredito,nombre,clabe,referencia,waId,limite,plazos,nivel,racha,renovaciones
10483,María López,012180001234567890,REF10483,525512345678,10000,4|8|12|16,2,7,1
10517,Alberto Ruiz,012180009876543210,REF10517,,,,,,
```
> Fila sin columnas del piloto (ej. `10517`) → solo carga su `Credit`, como siempre.
> - `waId`: `52` + 10 dígitos (si viene con `521…`, se normaliza solo, igual que `Conversation.waId`). **Obligatorio** en filas del piloto.
> - `limite`: número > 0 (`10000`, `"10,000"` o `$10000`). **Obligatorio**.
> - `plazos`: separados por `|` (o `;` / espacio), solo 4/8/12/16. **Obligatorio**.
> - `nivel` (1-4), `racha` (# pagos en tiempo y forma), `renovaciones`: opcionales; **vacío = no se toca** (al crear: nivel 1, racha 0, renovaciones 0).
> - `tasaSemanal` no va en el CSV: default `0.025` (2.5% semanal = 10% por cada 4 semanas).
> - Nombre, CLABE y referencia salen de `Credit` (no se duplican). El nombre se usa tal cual, sin "Don/Doña".
> El panel muestra un resumen aparte **"Piloto →"** con insertados/actualizados/omitidos y el motivo de cada fila rechazada.

### B. API / webhook
1. Crea las 3 plantillas (§2). UTILITY aprueba en minutos; crea `prox_credito_gancho` (MARKETING) **ya**, tarda más.
2. Env: `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `GRAPH_VERSION`, `VERIFY_TOKEN`, `META_APP_SECRET`, `MONGODB_URI`. Opcional: `METODO_INTERES=flat|frances`, `WABA_ID` (si creas plantillas por API).
3. Verifica webhook GET:
   ```bash
   curl "https://TU_DOMINIO/webhook?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=12345"   # -> 12345
   ```
4. Aplica las 2 ediciones (§4), `npm run build`, reinicia.
5. **Prueba end-to-end** con tu número: mándate `prox_credito_gancho` → toca "Calcular mi proximo credito" → recorre monto (prueba meter uno **mayor** a tu límite → debe rebotar) → plazo → cuota → agendar. Revisa que se cree el doc en `renovacioncitas`.

### C. Métricas del piloto
- **Entrega:** enviados vs `messages[0].id` vs fallidos.
- **Clic en gancho:** % que toca "Calcular mi proximo credito".
- **Avance de embudo:** monto → plazo → cuota → cita (dónde se caen).
- **Tiempo a respuesta:** minutos entre envío y primer toque.
- **Conversión:** % que agenda cita + % que además paga hoy.
- **Citas creadas:** `db.renovacioncitas.countDocuments({status:"pendiente_confirmacion"})`.

### D. Fallback
- **No responde al gancho:** no insistas hoy; el `due_date_action` es el segundo toque natural.
- **Entra al flujo y lo abandona:** el `stage` queda en `RENOVACION:*`; cualquier `menu` lo saca; agrega (opcional) un barrido en `scheduler.service.ts` que a los 30 min sin avance mande "¿Seguimos con tu renovación? Escribe *renovar*" y resetee a `start`.
- **Mete monto/plazo raro:** el flujo re-pregunta; nunca avanza con datos fuera de su límite/plazos.
- **"Necesito ayuda":** `stage: ASESOR` (humano).
- **No paga hoy:** usa tus `pago_atrasado` / `regulariza_tu_pago` existentes (tono de calle).

---

## 6. ⏰ ROADMAP (hoy jue 29 = DÍA 0)

- **Día −1 (ayer mié 28):** `streak_alert` — racha + nivel + "mañana cierras tu tanda".
- **Día 0 (hoy jue 29):** `due_date_action` (paga tu tanda de hoy) **+** `prox_credito_gancho` (gancho de renovación → flujo interactivo). Manda el gancho a quien ya va al corriente / cierra ciclo.
- **Día +1 (mañana vie 30):** visita del asesor para las citas agendadas; para quien no agendó, reintento del gancho.

---

## 7. ✅ Cumplimiento (Meta + SOFOM)
- UTILITY para recordatorios de pago; MARKETING para el gancho de renovación (opt-in).
- Sin "dinero fácil" ni crédito garantizado; footer `SOFOM E.N.R. Sujeto a aprobación.`
- "Nivel de confianza" = lealtad + historial real (no un disfraz del buró).
- Anti-sobreendeudamiento: el cliente **no puede** pedir más de su límite ni plazos no autorizados; la cuota es **estimada** y un asesor confirma.

---

## 8. 🛠️ PENDIENTES DE CORREGIR

### 8.1 `plazos` en el CSV: es un arreglo, hoy solo se toma el primero
- **Síntoma:** en el CSV de Créditos se manda `4,8,12` y solo se guarda `[4]`.
- **Causa:** el CSV separa columnas por coma. Sin comillas, `4,8,12` son **3 columnas**: `plazos` = `4`, y el `8` y `12` se recorren a las columnas siguientes (`nivel`, `racha`, …). El parser de plazos nunca recibe el valor completo.
- **Hoy funciona** si se escribe `4|8|12` (o `"4,8,12"` entre comillas).
- **Por corregir:**
  1. Aceptar `4,8,12` tal como lo captura el operador (sin depender de comillas ni de `|`).
  2. Si una fila trae **más columnas que el encabezado**, rechazarla con un error claro ("la fila tiene columnas de más, revisa comas en plazos") en vez de recorrer valores en silencio — hoy un `8` puede caer en `nivel` sin aviso.

### 8.2 `limite` = 0 → crédito NO autorizado (flujo de NO RENOVACIÓN)
- **Hoy:** el CSV rechaza `limite` ≤ 0 ("limite debe ser un número mayor a 0"), así que ese cliente no tiene perfil; si escribe "renovar" o toca el gancho, cae a asesor.
- **Regla nueva:** `limite = 0` es válido y significa **renovación no autorizada**.
- **Por corregir:**
  1. CSV: aceptar `limite = 0` (los plazos pueden ir vacíos en ese caso).
  2. Panel: **no permitir** mandar `prox_credito_gancho` a un cliente con límite 0 (error claro al operador).
  3. Flujo **NO RENOVACIÓN**: si un cliente con límite 0 entra a la renovación (botón o "renovar"), no se le pide monto; se le manda un mensaje sin oferta y no se agenda nada.
- **Por definir antes de codificar:** el texto del mensaje de NO RENOVACIÓN (tono de calle, sin prometer crédito) y si además se pasa a asesor o solo se cierra el flujo.
