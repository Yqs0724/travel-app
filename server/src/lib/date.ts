/** 按本地日期生成 UTC 正午，避免时区把「天」挤乱 */
export function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate(), 12));
  const last = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate(), 12));
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export function parseDateInput(s: string): Date {
  // YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error("日期格式应为 YYYY-MM-DD");
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}
