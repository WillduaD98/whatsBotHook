// Textos que manda el bot cuando el cliente toca "¿Para qué sirve mi racha?" (plantilla del día −2): qué es la racha,
// qué desbloquea y lo que viene. Van en 3 mensajes separados para leerse fácil. Puro: sin BD ni HTTP.

const QUE_ES_TEXT =
  "🔥 *¿Qué es tu racha?*\n\n" +
  "Tu racha es un indicador interno del *buen historial crediticio* que estás generando con TandaYa 💪\n\n" +
  "📈 A mayor racha 🔥, mejor historial… y puedes acceder a *mejores opciones de crédito*.";

const QUE_DESBLOQUEAS_TEXT =
  "🔓 *¿Qué desbloqueas?*\n\n" +
  "Si acumulas *3 créditos seguidos* con TandaYa con buenas rachas 🔥, desbloqueas *opciones de plazo* para tu crédito:\n" +
  "📆 el que mejor se adecúe a tu negocio.";

const LO_QUE_VIENE_TEXT = "🎁 Y muy pronto se desbloquearán *más beneficios* para tu racha 🔥";

// Cierre con su racha actual; sin perfil del piloto (racha null) va sin esa línea.
function buildLoQueVieneText(racha: number | null): string {
  const rachaActual = racha === null ? "" : `\n\nHoy llevas *${racha} pagos* en tiempo y forma.`;
  return `${LO_QUE_VIENE_TEXT}${rachaActual}\n¡Sigue así! 💪`;
}

// Los 3 mensajes en el orden en que se mandan.
export function buildExplicacionRacha(racha: number | null): string[] {
  return [QUE_ES_TEXT, QUE_DESBLOQUEAS_TEXT, buildLoQueVieneText(racha)];
}
