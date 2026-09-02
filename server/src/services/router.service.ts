// Objetivo: que el bot sea MUY fluido y casi nunca caiga en UNKNOWN.
// Estrategia:
// 1) Intent detection con normalización fuerte (acentos, signos, repetición de letras).
// 2) Diccionario amplio + patrones por intención.
// 3) Manejar "números del menú" (1,2,3...) y respuestas tipo "opcion 3".
// 4) Cuando no se entiende: preguntar con botones/texto guiado + repetir menú corto.
// 5) Mensajes que piden 1 sola cosa a la vez (reduce respuestas raras).

// Define el tipo de intenciones posibles que el router puede detectar
export type Intent =
  | "REQUISITOS"
  | "QUIERO_CREDITO"
  | "PAGOS"
  | "ASESOR"
  | "EXPLICACION"
  | "HORARIOS"
  | "SUCURSAL"
  | "SALUDO"
  | "FAQ_MENU"
  | "GRACIAS"
  | "MONTOS_PLAZOS"
  | "PRE_SOLICITUD"
  | "CONFIANZA"
  | "UNKNOWN";

// Normaliza el texto para detección de intención:
// - Minúsculas, remueve acentos y signos
// - Reduce repetición de letras (holaaaa -> holaa)
// - Colapsa espacios múltiples
export function normalizeText(input: string): string {
  return (input || "")
    .toLowerCase()
    .trim()
    // quita acentos
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // reduce letras repetidas tipo "holaaaa" -> "holaa"
    .replace(/([a-z])\1{2,}/g, "$1$1")
    // quita signos raros, deja letras/numeros/espacios
    .replace(/[^a-z0-9\s]/g, " ")
    // colapsa espacios y TRIM final para eliminar espacios de borde generados
    .replace(/\s+/g, " ")
    .trim();
}


// Evalúa si alguna expresión regular coincide con el texto
function testAny(t: string, patterns: RegExp[]) {
  return patterns.some((p) => p.test(t));
}

// Detecta si el usuario escribe "cliente" / "soy cliente" para entrar al flujo de cliente sin tocar botón
export function isClienteText(text: string): boolean {
  const t = normalizeText(text);
  return /\b(soy cliente|cliente)\b/.test(t);
}

// Detección principal de intención basada en texto normalizado y patrones
export function detectIntent(text: string): Intent {
  // Aplica normalización para aumentar recall y reducir variaciones
  const t = normalizeText(text);
  
  // Log útil para depurar qué se está detectando realmente
  console.log("detectIntent:", t);

  // 1) Salud / gracias (reduce fricción)
  if (testAny(t, [/^(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/, /\bque onda\b/, /\bhey\b/])) return "SALUDO";
  if (testAny(t, [/\bgracias\b/, /\bmuchas gracias\b/, /\bmil gracias\b/, /\bperfecto\b/])) return "GRACIAS";

  // 2) HUMANO (prioridad alta)
  if (
    testAny(t, [
      /\b(asesor|humano|persona|representante|ejecutivo|atencion|soporte)\b/,
      /\b(llamar|marcar|telefono|contactar|hablar)\b.*\b(asesor|persona|humano)\b/,
      /\bquiero hablar con\b/
    ])
  ) return "ASESOR";

  // 3) MONTOS (consultas de cantidades y montos del crédito)
  // - Detecta números tipo: 8000, 8,000, $8,000, $ 10000
  // - Detecta palabras clave: monto, montos, cantidad
  if (
    testAny(t, [
      /\b(monto|montos|cantidad|cantidades)\b/,
      /(?:\$\s*)?\b\d{1,3}(?:[\.,\s]\d{3})+\b/, // 8,000 ; 12.000 ; 8 000
      /(?:\$\s*)?\b\d{4,}\b/ // 8000 ; $10000
    ])
  ) return "MONTOS_PLAZOS";

  // 4) PAGOS (si aún se usa en otros flujos)
  if (
    testAny(t, [
      /\b(pago|pagar|pague|pagare|pago hoy|abono|abonar|deposito|transferencia)\b/,
      /\b(saldo|debo|deuda|cuota|semana|diario|atraso|atrasado|mora|recargo|multa)\b/,
      /\b(fecha de pago|cuando pago|donde pago|comprobante)\b/
    ])
  ) return "PAGOS";

  // 5) REQUISITOS
  if (
    testAny(t, [
      /\b(requisito|requisitos|papeles|documentos|documentacion|ine|identificacion|comprobante)\b/,
      /\b(que necesito|que piden|que se requiere|que ocupo)\b/
    ])
  ) return "REQUISITOS";

  // 6) QUIERO_CREDITO
  if (
    testAny(t, [
      /\b(quiero|necesito|busco|me interesa|solicito)\b.*\b(credito|prestamo)\b/,
      /\b(me prestan|me pueden prestar|me pueden dar)\b/,
      /\b(aplicar|solicitar|tramitar|iniciar|registrarme)\b.*\b(credito|prestamo)?\b/,
      /\b(cuanto me prestan|cuanto dan|monto)\b/
    ])
  ) return "QUIERO_CREDITO";

  // 7) EXPLICACION (cómo funciona, plazos, semanal/diario, etc.)
  if (
    testAny(t, [
      /\b(como funciona|como funciona el credito|explicacion|explica|info|informacion|detalle)\b/,
      /\b(plazo|plazos|semanal|diario|semanales|diarios|interes|tasa|cuotas)\b/,
      /\b(quiero saber mas|cuentame|dime mas)\b/
    ])
  ) return "EXPLICACION";

  // 8) HORARIOS / SUCURSAL (si lo mencionan)
  if (testAny(t, [/\b(horario|horarios|abren|cierran|a que hora|domingo|sabado)\b/])) return "HORARIOS";
  if (testAny(t, [/\b(sucursal|oficina|direccion|ubicacion|donde estan|donde quedan|maps)\b/])) return "SUCURSAL";

  //Modulo de Confianza
  if (
    testAny(t, [
      /\b(confianza|confianza en|confianza con|confianza con el|confianza con la|confianza con el banco|confianza con la banco)\b/,
      /\b(confianza en el|confianza en la|confianza en el banco|confianza en la banco|gota |got |colombia|colombia|colombianos|informal|estafa|fraude)\b/
    ])
  ) return "CONFIANZA";

  if (
    testAny(t, [
      /\b(\pre|pre-solicitud|pre solicitud|pre-solicit|pre solicit|solicitud|solicitar|aplicar|aplicacion|aplicación|verificac|verificaci|verificaccion|verificaciion|verificacioon|verificacionn|berificacion|verificacion)\b/,
    ])
  ) return "PRE_SOLICITUD";



  // Fallback si no hay coincidencias
  return "UNKNOWN";
}

// Helpers para que el texto guíe al usuario y reduzca respuestas “raras”
function menuShort() {
  return (
    "*📌 PREGUNTAS FRECUENTES*\n" +
    "Escribe lo que necesitas (ej: *requisitos*, *montos*, *cómo funciona*).\n\n" +
    "Para volver al menú principal escribe: *MENÚ*"
  );
}

function askOneThing(question: string) {
  // Pide UNA sola cosa. Eso reduce mensajes fuera de formato.
  return question + "\n\n" + "Responde con un texto corto 🙌";
}

// Construye la respuesta de texto asociada a una intención específica
export function buildReply(intent: Intent) {
  switch (intent) {
    case "SALUDO":
      return (
        "Hola 👋 Soy el asistente de *TandaYa*.\n\n" +
        "*¿Qué necesitas el día de hoy?*\n\n" +
        "Escribe *MENÚ* para ver opciones."
      );

    case "FAQ_MENU":
      return menuShort();

    case "GRACIAS":
      // Cierra con cordialidad y vuelve a ofrecer el menú corto
      return "¡Con gusto! 😊\n\n" + menuShort();

    case "REQUISITOS":
      // Lista breve de requisitos básicos y pregunta UNA cosa para avanzar
      return (
        "*Requisitos básicos:*\n\n" +
        "• 🏪 *Negocio propio* (ya establecido) \n" +
        "• 🪪 *INE vigente* \n" +
        "• 🏠 *Comprobante de domicilio* del negocio \n" +
        "• 🧾 *Documento que valide que eres dueño de tu negocio. (ejemplo: Constancia de situación fiscal, contrato de renta del local a tu nombre, etc.) \n\n" 
        // "Si quieres, también te explico *cómo funciona* paso a paso 😊\n" +
        // "*Escribe:*\n" +
        // "👉 *como funciona* \n\n" +
        // "Para regresar al menú principal, escribe:"+
        // "👉 Menu"
      );

    case "HORARIOS":
      // Informa horarios genéricos y solicita sucursal/ciudad para precisar
      return (
        "🕒 Horarios:\n" +
        "• Lunes a viernes: [horario]\n" +
        "• Sábado: [horario]\n" +
        "• Domingo: [si/no]\n\n" +
        "¿Qué sucursal/ciudad te queda cerca para confirmarte el horario exacto?"
      );

    case "EXPLICACION":
      // Explica modalidades de crédito de manera clara y guía a una sola respuesta
      return (
        "Te explico claro y rápido cómo funciona 👇\n\n" +
        "✅ Tenemos 2 modalidades, según tu negocio y tu flujo:\n\n" +
        "1) 📆 Crédito SEMANAL (negocios más establecidos)\n" +
        "• Plazos: 4, 8, 12 y 16 semanas\n" +
        "• Pagas 1 vez por semana (cuotas fijas)\n\n" +
        "2) 📅 Crédito DIARIO (negocios más pequeños o si lo prefieres)\n" +
        "• Monto/plazo más accesibles\n" +
        "• Pagos diarios para que se te haga ligero\n\n" 
        // "Para explicarte cuales son los montos iniciales, escríbeme SOLO esto:\n \n" +
        // "👉 Monto \n \n" +
        // "Para Regresar al menú principal escribe :\n \n" +
        // "👉 Menu" 
        
      );

    case "QUIERO_CREDITO":
      // Flujo ultra controlado: pregunta 1 cosa a la vez
      return askOneThing("¡Va! 🙌 Primero: ¿qué tipo de negocio tienes? (ej: abarrotes, tortillería, estética)");

    // case "PAGOS":
    //   // Solicita sucursal para localizar el crédito y poder ayudar con pagos/saldo
    //   return (
    //     "Para ayudarte con pagos/saldo necesito ubicar tu crédito 🔎\n\n" +
    //     "Respóndeme SOLO una cosa:\n" +
    //     "👉 ¿En qué sucursal lo sacaste? (ej: León Centro, San Pancho, etc.)"
    //   );

    case "MONTOS_PLAZOS":
      // Expone rangos iniciales y explica que dependen del establecimiento del negocio
      return (
        "💰 *Montos iniciales*\n\n" +
        "Los montos que normalmente autorizamos al inicio van desde:\n" +
        "✅ $2,000 hasta $15,000 MXN\n\n" +
        "📌 *¿De qué depende el monto?*\n" +
        "Depende de qué tan establecido esté tu negocio (tiempo operando, ventas, movimiento, etc.).\n\n" +
        "📈 *Buenas noticias*\n" +
        "Conforme vayas generando historial con nosotros y pagues bien, tu monto puede aumentar sin problema.\n\n" 
        // "Si tienes dudas sobre quien es Tanda Ya, escribe esto:\n \n" +
        // "👉 Confianza \n\n " +
        // "Para empezar tu proceso de pre-solicitud, escríbeme esto:\n \n" +
        // "👉 Solicitud \n\n" +
        // "Para ir al menú principal, escríbeme esto:\n \n" +
        // "👉 Menu" 
      );

    case "SUCURSAL":
      // Solicita colonia/municipio para poder orientar dirección y cómo llegar
      return (
        "Tanda Ya! Ofrece sus servicios de forma digital y a domicilio. \n" +
        "Por lo cual no contamos con sucursales, pero sí ertura en diferentes zonas del país! \n\n" 
  
      );

    case "ASESOR":
      // Deriva a asesor pidiendo un dato único para canalizar rápido
      return (
        "Claro 👍 un asesor se comunicará contigo pronto por este mismo medio.\n\n" +
        "Para canalizarte rápido, respóndeme SOLO esto:\n" +
        "👉 Tu nombre completo"
      );

    case "PRE_SOLICITUD":
      return (
        "🔎 Pre-Solicitud\n\n" +
        "Para avanzar sin confusiones, seguimos estos pasos uno por uno:\n\n" +
        "• 📸 Envíame 3 fotos de tu negocio (por fuera y adentro).\n" +
        "• 🪪 Envíame foto de tu INE por delante.\n" +
        "• 🪪 Envíame foto de tu INE por atrás.\n" +
        "• 📍 Comparte tu ubicación actual (si estás en el negocio).\n\n" +
        "En cualquier momento, escribe 'Regresar' o 'MENÚ' para volver al menú principal.\n\n" +
        "Cuando termines, te regreso al menú principal.\n\n" +
        "👉 *Empecemos: envía 3 fotos de tu negocio.*"
      );

      case "CONFIANZA":
        //Regresa mensaje para generar confianza al cliente
        return ("¿*Quién es Tanda Ya*? 👋 \n\n " +
            "*Tanda Ya!* es una marca *registrada* que opera bajo la entidad financiera *INSEREX S.A. de C.V., SOFOM E.N.R.* \n\n" +
            "✅ Estamos *dados de alta* ante la *Comisión Nacional Bancaria y de Valores (CNBV)* \n " +
            "✅ Y operamos *regulados por CONDUSEF* \n" +
            "Por eso a veces te pedimos algunos datos y documentos 👇 \n\n" +
            "📍 *Ubicación del negocio* \n " +
            "🏪 *Fotos del negocio* (fachada e interior) \n " +
            "🪪 *Identificación* (para confirmar que eres tú) \n " +
            "🧾 *Comprobante de domicilio* (para validar la información) \n\n" +
            "Esto NO es para molestarte 🙏  \n " +
            "Es porque, como financiera formal, *tenemos que verificar* que: \n " +
            "• la persona es quien dice ser  \n " +
            "• el negocio existe y está establecido  \n " +
            "• y que todo esté en regla para poder darte el monto correcto *sin ahogarte*\n "
          );

    default:
      return (
        "Te entendí a medias 😅\n\n" +
        "Para ayudarte rápido:\n\n" +
        "👉 Escribe: *MENÚ*\n" +
        "👉 O escribe: *Solicitud*"
      );
  }
}
