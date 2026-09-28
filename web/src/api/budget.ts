import { api, getToken, type ApiOpts } from "./client";

export type ExpenseSplit = { id: string; member: string; ratio: number };

export type Expense = {
  id: string;
  tripId: string;
  category: string;
  amount: number;
  payer: string;
  date: string;
  note: string | null;
  hasReceipt?: boolean;
  splits: ExpenseSplit[];
};

export type Transfer = { from: string; to: string; amount: number };

export type BudgetSummary = {
  total: number;
  myShare?: number;
  othersOweMe?: number;
  byCategory: Record<string, number>;
};

export const CATEGORY_LABELS: Record<string, string> = {
  hotel: "酒店",
  flight: "机票",
  food: "餐饮",
  ticket: "门票",
  transport: "交通",
  other: "其他",
};

export function listExpenses(tripId: string, opts?: ApiOpts) {
  return api<Expense[]>(`/api/v1/trips/${tripId}/expenses`, {}, opts);
}

export function addExpense(
  tripId: string,
  body: {
    category: string;
    amount: number;
    payer: string;
    date?: string;
    note?: string;
    splits?: Array<{ member: string; ratio?: number }>;
  },
  opts?: ApiOpts,
) {
  return api<Expense[]>(`/api/v1/trips/${tripId}/expenses`, {
    method: "POST",
    body: JSON.stringify(body),
  }, opts);
}

export function updateExpense(
  id: string,
  body: {
    category?: string;
    amount?: number;
    payer?: string;
    date?: string;
    note?: string | null;
    splits?: Array<{ member: string; ratio?: number }>;
  },
  opts?: ApiOpts,
) {
  return api<Expense[]>(`/api/v1/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }, opts);
}

export function deleteExpense(id: string, opts?: ApiOpts) {
  return api<Expense[]>(`/api/v1/expenses/${id}`, { method: "DELETE" }, opts);
}

export function uploadReceipt(expenseId: string, dataUrl: string, opts?: ApiOpts) {
  return api<Expense[]>(`/api/v1/expenses/${expenseId}/receipt`, {
    method: "PUT",
    body: JSON.stringify({ dataUrl }),
  }, opts);
}

export function clearReceipt(expenseId: string, opts?: ApiOpts) {
  return api<Expense[]>(`/api/v1/expenses/${expenseId}/receipt`, { method: "DELETE" }, opts);
}

/** 带鉴权拉附图，返回 object URL（调用方负责 revoke） */
export async function fetchReceiptObjectUrl(
  expenseId: string,
  opts?: ApiOpts,
): Promise<string | null> {
  const headers = new Headers();
  const token = opts && "token" in opts ? opts.token : getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api/v1/expenses/${expenseId}/receipt`, { headers });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function getSettlement(tripId: string, opts?: ApiOpts) {
  return api<Transfer[]>(`/api/v1/trips/${tripId}/settlement`, {}, opts);
}

export function getBudgetSummary(tripId: string, opts?: ApiOpts) {
  return api<BudgetSummary>(`/api/v1/trips/${tripId}/budget-summary`, {}, opts);
}

/** 预计花费条目（预算）；implanted 后仍保留，不删行 */
export type BudgetPlanItem = {
  id: string;
  tripId: string;
  name: string;
  /** 账单总额 */
  amount: number;
  implanted: boolean;
  /** 已入账时「我」承担；未入账为 null */
  myShare: number | null;
  /** 共同分摊朋友数 */
  friendCount: number;
};

/** 预算合计用：已入账共同用 myShare，否则用 amount */
export function planMyAmount(it: BudgetPlanItem) {
  if (it.implanted && it.myShare != null) return it.myShare;
  return it.amount;
}

export function listBudgetPlans(tripId: string, opts?: ApiOpts) {
  return api<BudgetPlanItem[]>(`/api/v1/trips/${tripId}/budget-plans`, {}, opts);
}

export function addBudgetPlan(
  tripId: string,
  body: { name: string; amount: number },
  opts?: ApiOpts,
) {
  return api<BudgetPlanItem[]>(`/api/v1/trips/${tripId}/budget-plans`, {
    method: "POST",
    body: JSON.stringify(body),
  }, opts);
}

export function updateBudgetPlan(
  id: string,
  body: { name?: string; amount?: number },
  opts?: ApiOpts,
) {
  return api<BudgetPlanItem[]>(`/api/v1/budget-plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }, opts);
}

export function deleteBudgetPlan(id: string, opts?: ApiOpts) {
  return api<BudgetPlanItem[]>(`/api/v1/budget-plans/${id}`, { method: "DELETE" }, opts);
}

/** 预算植入实付；friends 为空=个人支出 */
export function implantBudgetPlan(id: string, friends: string[] = [], opts?: ApiOpts) {
  return api<BudgetPlanItem[]>(`/api/v1/budget-plans/${id}/implant`, {
    method: "POST",
    body: JSON.stringify({ friends }),
  }, opts);
}

export function yuan(n: number) {
  return `¥${n.toFixed(2)}`;
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请选择图片"));
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      reject(new Error("图片需小于 2MB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取失败"));
    reader.readAsDataURL(file);
  });
}
