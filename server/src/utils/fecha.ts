// Helpers genéricos de fechas en la zona horaria del negocio (México).

// "en-CA" da el formato YYYY-MM-DD; la zona fija evita que el server en UTC cambie de día antes de tiempo.
const FECHA_MX = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Día siguiente a `now` en México ("YYYY-MM-DD"). México no tiene horario de verano desde 2022, así que +24h es exacto.
export function fechaMananaMx(now: Date): string {
  return FECHA_MX.format(new Date(now.getTime() + UN_DIA_MS));
}
