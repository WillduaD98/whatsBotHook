import { Message } from '../../types';

export function sortDedupe(arr: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of arr) map.set(m._id || `${m.messageId}-${m.createdAt}`, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function sameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const eq = (x: Date, y: Date) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  if (eq(d, now)) return 'Hoy';
  if (eq(d, yest)) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}
