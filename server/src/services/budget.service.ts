import { prisma } from "../lib/prisma.js";
import { deleteReceiptFile, readReceiptFile, saveReceiptFile } from "../lib/uploads.js";
import { settle } from "./settlement.js";

export const CATEGORIES = ["hotel", "flight", "food", "ticket", "transport", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

const expenseInclude = { splits: true as const };

/** 账本主人固定为「我」；members 只存同行朋友 */
export function selfMember(): string {
  return "我";
}

function mapExpense<T extends { receiptExt: string | null }>(e: T) {
  const { receiptExt, ...rest } = e;
  return { ...rest, hasReceipt: !!receiptExt, receiptExt };
}

function memberShare(
  amount: number,
  splits: Array<{ member: string; ratio: number }>,
  member: string,
): number {
  const ratioSum = splits.reduce((s, x) => s + x.ratio, 0);
  if (ratioSum <= 0) return 0;
  const mine = splits.find((s) => s.member === member)?.ratio ?? 0;
  return (amount * mine) / ratioSum;
}

export async function tripIdForExpense(expenseId: string) {
  const row = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { tripId: true },
  });
  return row?.tripId ?? null;
}

/** 清掉历史「行程估价自动灌账」：挂 itemId 的门票/路费 */
export async function purgeEstimateLinkedExpenses() {
  await prisma.expense.deleteMany({
    where: {
      itemId: { not: null },
      category: { in: ["ticket", "transport"] },
    },
  });
}

export async function listExpenses(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });
  const rows = await prisma.expense.findMany({
    where: { tripId },
    include: expenseInclude,
    orderBy: { date: "desc" },
  });
  return rows.map(mapExpense);
}

export async function summary(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });
  const me = selfMember();
  const rows = await listExpenses(tripId);
  const byCat: Record<string, number> = {};
  let total = 0;
  let myShare = 0;
  for (const e of rows) {
    byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
    total += e.amount;
    myShare += memberShare(e.amount, e.splits, me);
  }
  myShare = Math.round(myShare * 100) / 100;
  total = Math.round(total * 100) / 100;
  const othersOweMe = Math.round((total - myShare) * 100) / 100;
  return { total, myShare, othersOweMe, byCategory: byCat };
}

export async function settlement(tripId: string) {
  const rows = await listExpenses(tripId);
  return settle(
    rows.map((e) => ({
      amount: e.amount,
      payer: e.payer,
      splits: e.splits.map((s) => ({ member: s.member, ratio: s.ratio })),
    })),
  );
}

export type AddExpenseInput = {
  category: Category;
  amount: number;
  /** 忽略：账本固定「我」付 */
  payer?: string;
  date?: string;
  note?: string;
  splits?: Array<{ member: string; ratio?: number }>;
};

function normalizeSplits(
  me: string,
  input?: Array<{ member: string; ratio?: number }>,
): Array<{ member: string; ratio: number }> {
  const raw =
    input?.length && input.some((s) => s.member.trim())
      ? input.map((s) => ({ member: s.member.trim(), ratio: s.ratio ?? 1 })).filter((s) => s.member)
      : [{ member: me, ratio: 1 }];
  if (!raw.some((s) => s.member === me)) {
    raw.unshift({ member: me, ratio: 1 });
  }
  return raw;
}

export async function addExpense(tripId: string, input: AddExpenseInput) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });

  const me = selfMember();
  const splitSrc = normalizeSplits(me, input.splits);
  const date = input.date ? new Date(input.date + "T12:00:00.000Z") : new Date();

  await prisma.expense.create({
    data: {
      tripId,
      category: input.category,
      amount: input.amount,
      payer: me,
      date,
      note: input.note?.trim() || null,
      splits: { create: splitSrc },
    },
  });
  return listExpenses(tripId);
}

export async function removeExpense(id: string) {
  const row = await prisma.expense.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error("账单不存在"), { code: 40003 });
  await deleteReceiptFile(id, row.receiptExt);
  await prisma.expense.delete({ where: { id } });
  return listExpenses(row.tripId);
}

export type UpdateExpenseInput = {
  category?: Category;
  amount?: number;
  payer?: string;
  date?: string;
  note?: string | null;
  splits?: Array<{ member: string; ratio?: number }>;
};

export async function updateExpense(id: string, input: UpdateExpenseInput) {
  const row = await prisma.expense.findUnique({ where: { id }, include: expenseInclude });
  if (!row) throw Object.assign(new Error("账单不存在"), { code: 40003 });

  const me = selfMember();
  const date =
    input.date != null ? new Date(input.date + "T12:00:00.000Z") : undefined;

  if (input.splits) {
    const splitSrc = normalizeSplits(me, input.splits);
    await prisma.$transaction([
      prisma.expenseSplit.deleteMany({ where: { expenseId: id } }),
      prisma.expense.update({
        where: { id },
        data: {
          category: input.category,
          amount: input.amount,
          payer: me,
          date,
          note: input.note === undefined ? undefined : input.note?.trim() || null,
          splits: { create: splitSrc },
        },
      }),
    ]);
  } else {
    await prisma.expense.update({
      where: { id },
      data: {
        category: input.category,
        amount: input.amount,
        payer: me,
        date,
        note: input.note === undefined ? undefined : input.note?.trim() || null,
      },
    });
  }

  return listExpenses(row.tripId);
}

export async function saveReceipt(expenseId: string, dataUrl: string) {
  const row = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!row) throw Object.assign(new Error("账单不存在"), { code: 40003 });
  const ext = await saveReceiptFile(expenseId, dataUrl);
  await prisma.expense.update({
    where: { id: expenseId },
    data: { receiptExt: ext },
  });
  return listExpenses(row.tripId);
}

export async function getReceipt(expenseId: string) {
  const row = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { receiptExt: true, tripId: true },
  });
  if (!row?.receiptExt) {
    throw Object.assign(new Error("暂无附图"), { code: 40003 });
  }
  const file = await readReceiptFile(expenseId, row.receiptExt);
  return { ...file, tripId: row.tripId };
}

export async function clearReceipt(expenseId: string) {
  const row = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!row) throw Object.assign(new Error("账单不存在"), { code: 40003 });
  await deleteReceiptFile(expenseId, row.receiptExt);
  await prisma.expense.update({
    where: { id: expenseId },
    data: { receiptExt: null },
  });
  return listExpenses(row.tripId);
}

/** 删行程点时清掉仍挂在该点上的账单（手填关联） */
export async function removeExpensesForItem(itemId: string) {
  await prisma.expense.deleteMany({ where: { itemId } });
}

/** 预计花费合计（分位四舍五入） */
export function planTotal(amounts: number[]): number {
  const n = amounts.reduce((s, a) => s + a, 0);
  return Math.round(n * 100) / 100;
}

/** 预算行计入「我」的金额：已入账共同用 myShare，否则用账单额 */
export function planMyAmount(row: {
  amount: number;
  implanted: boolean;
  myShare: number | null;
}): number {
  if (row.implanted && row.myShare != null) return row.myShare;
  return row.amount;
}

export async function listBudgetPlans(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });
  const rows = await prisma.budgetPlanItem.findMany({
    where: { tripId },
    orderBy: [{ implanted: "asc" }, { id: "asc" }],
  });
  await backfillPlanMyShare(tripId, rows);
  return prisma.budgetPlanItem.findMany({
    where: { tripId },
    orderBy: [{ implanted: "asc" }, { id: "asc" }],
  });
}

/** 旧数据：已入账但无 myShare 时，按同名同额账单拆「我」的份 */
async function backfillPlanMyShare(
  tripId: string,
  rows: Array<{
    id: string;
    name: string;
    amount: number;
    implanted: boolean;
    myShare: number | null;
  }>,
) {
  const need = rows.filter((r) => r.implanted && r.myShare == null);
  if (need.length === 0) return;
  const expenses = await prisma.expense.findMany({
    where: { tripId },
    include: { splits: true },
  });
  const me = selfMember();
  for (const r of need) {
    const exp = expenses.find(
      (e) => e.note === r.name && Math.abs(e.amount - r.amount) < 0.001,
    );
    if (!exp) {
      await prisma.budgetPlanItem.update({
        where: { id: r.id },
        data: { myShare: r.amount, friendCount: 0 },
      });
      continue;
    }
    const heads = exp.splits.length || 1;
    const mine = memberShare(exp.amount, exp.splits, me);
    await prisma.budgetPlanItem.update({
      where: { id: r.id },
      data: {
        myShare: mine,
        friendCount: Math.max(0, heads - 1),
      },
    });
  }
}

export async function addBudgetPlan(tripId: string, name: string, amount: number) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw Object.assign(new Error("行程不存在"), { code: 40003 });
  const title = name.trim();
  if (!title) throw Object.assign(new Error("请填写花费项目"), { code: 40001 });
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error("预计花费无效"), { code: 40001 });
  }
  await prisma.budgetPlanItem.create({
    data: { tripId, name: title, amount: Math.round(amount * 100) / 100 },
  });
  return listBudgetPlans(tripId);
}

export async function updateBudgetPlan(
  id: string,
  data: { name?: string; amount?: number },
) {
  const row = await prisma.budgetPlanItem.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error("预算项不存在"), { code: 40003 });
  if (row.implanted) {
    throw Object.assign(new Error("已入账预算不可改"), { code: 40001 });
  }
  const patch: { name?: string; amount?: number } = {};
  if (data.name !== undefined) {
    const title = data.name.trim();
    if (!title) throw Object.assign(new Error("请填写花费项目"), { code: 40001 });
    patch.name = title;
  }
  if (data.amount !== undefined) {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw Object.assign(new Error("预计花费无效"), { code: 40001 });
    }
    patch.amount = Math.round(data.amount * 100) / 100;
  }
  await prisma.budgetPlanItem.update({ where: { id }, data: patch });
  return listBudgetPlans(row.tripId);
}

export async function removeBudgetPlan(id: string) {
  const row = await prisma.budgetPlanItem.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error("预算项不存在"), { code: 40003 });
  if (row.implanted) {
    throw Object.assign(new Error("已入账预算不可删"), { code: 40001 });
  }
  await prisma.budgetPlanItem.delete({ where: { id } });
  return listBudgetPlans(row.tripId);
}

/** 预算植入实付：写一条 Expense，预算行保留并标 implanted */
export async function implantBudgetPlan(
  id: string,
  friends: string[] = [],
) {
  const row = await prisma.budgetPlanItem.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error("预算项不存在"), { code: 40003 });
  if (row.implanted) {
    throw Object.assign(new Error("该预算已入账"), { code: 40001 });
  }
  const me = selfMember();
  const picked = friends.map((m) => m.trim()).filter((m) => m && m !== me);
  const heads = 1 + picked.length;
  const myShare = Math.round((row.amount / heads) * 100) / 100;
  await addExpense(row.tripId, {
    category: "other",
    amount: row.amount,
    note: row.name,
    splits: [{ member: me, ratio: 1 }, ...picked.map((m) => ({ member: m, ratio: 1 }))],
  });
  await prisma.budgetPlanItem.update({
    where: { id },
    data: { implanted: true, myShare, friendCount: picked.length },
  });
  return listBudgetPlans(row.tripId);
}

export async function tripIdForBudgetPlan(id: string) {
  const row = await prisma.budgetPlanItem.findUnique({
    where: { id },
    select: { tripId: true },
  });
  return row?.tripId ?? null;
}
