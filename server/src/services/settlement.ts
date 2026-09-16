export type SplitIn = { member: string; ratio: number };
export type ExpenseIn = { amount: number; payer: string; splits: SplitIn[] };

export type Transfer = { from: string; to: string; amount: number };

/** 净额 = 已付 − 分摊；正为债权人。贪心配对最简转账。 */
export function settle(expenses: ExpenseIn[]): Transfer[] {
  const net = new Map<string, number>();

  function add(name: string, delta: number) {
    net.set(name, (net.get(name) ?? 0) + delta);
  }

  for (const e of expenses) {
    add(e.payer, e.amount);
    const ratioSum = e.splits.reduce((s, x) => s + x.ratio, 0);
    if (ratioSum <= 0) continue;
    for (const sp of e.splits) {
      add(sp.member, -(e.amount * sp.ratio) / ratioSum);
    }
  }

  const creditors: Array<{ name: string; amt: number }> = [];
  const debtors: Array<{ name: string; amt: number }> = [];
  for (const [name, v] of net) {
    const rounded = Math.round(v * 100) / 100;
    if (rounded > 0.009) creditors.push({ name, amt: rounded });
    else if (rounded < -0.009) debtors.push({ name, amt: -rounded });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const c = creditors[i]!;
    const d = debtors[j]!;
    const pay = Math.round(Math.min(c.amt, d.amt) * 100) / 100;
    if (pay > 0) out.push({ from: d.name, to: c.name, amount: pay });
    c.amt = Math.round((c.amt - pay) * 100) / 100;
    d.amt = Math.round((d.amt - pay) * 100) / 100;
    if (c.amt <= 0.009) i++;
    if (d.amt <= 0.009) j++;
  }
  return out;
}
