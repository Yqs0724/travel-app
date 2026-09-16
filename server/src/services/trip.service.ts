import { prisma } from "../lib/prisma.js";
import { eachDay, parseDateInput } from "../lib/date.js";

const tripInclude = {
  days: {
    orderBy: { date: "asc" as const },
    include: {
      items: {
        orderBy: { seq: "asc" as const },
        include: { poi: true, legToNext: true },
      },
    },
  },
};

export async function listTrips() {
  return prisma.trip.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      members: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getTrip(id: string) {
  return prisma.trip.findUnique({ where: { id }, include: tripInclude });
}

export type CreateTripInput = {
  title: string;
  startDate: string;
  endDate: string;
  members?: string[];
  currency?: string;
};

export async function createTrip(input: CreateTripInput) {
  const start = parseDateInput(input.startDate);
  const end = parseDateInput(input.endDate);
  if (end < start) throw Object.assign(new Error("结束日期不能早于开始日期"), { code: 40002 });

  const members = JSON.stringify(
    (input.members ?? []).map((m) => m.trim()).filter((m) => m && m !== "我"),
  );
  const days = eachDay(start, end);

  return prisma.trip.create({
    data: {
      title: input.title.trim(),
      startDate: start,
      endDate: end,
      members,
      currency: input.currency ?? "CNY",
      days: { create: days.map((date) => ({ date })) },
    },
    include: tripInclude,
  });
}

export type UpdateTripInput = {
  title?: string;
  startDate?: string;
  endDate?: string;
  members?: string[];
  currency?: string;
};

export async function updateTrip(id: string, input: UpdateTripInput) {
  const existing = await prisma.trip.findUnique({ where: { id }, include: { days: true } });
  if (!existing) return null;

  const start = input.startDate ? parseDateInput(input.startDate) : existing.startDate;
  const end = input.endDate ? parseDateInput(input.endDate) : existing.endDate;
  if (end < start) throw Object.assign(new Error("结束日期不能早于开始日期"), { code: 40002 });

  const datesChanged =
    start.getTime() !== existing.startDate.getTime() || end.getTime() !== existing.endDate.getTime();

  return prisma.$transaction(async (tx) => {
    if (datesChanged) {
      const wanted = eachDay(start, end);
      const wantedKeys = new Set(wanted.map((d) => d.toISOString()));
      const existingByKey = new Map(existing.days.map((d) => [d.date.toISOString(), d]));

      for (const day of existing.days) {
        if (!wantedKeys.has(day.date.toISOString())) {
          await tx.tripDay.delete({ where: { id: day.id } });
        }
      }
      for (const date of wanted) {
        if (!existingByKey.has(date.toISOString())) {
          await tx.tripDay.create({ data: { tripId: id, date } });
        }
      }
    }

    return tx.trip.update({
      where: { id },
      data: {
        title: input.title?.trim(),
        startDate: start,
        endDate: end,
        members: input.members
          ? JSON.stringify(input.members.map((m) => m.trim()).filter((m) => m && m !== "我"))
          : undefined,
        currency: input.currency,
      },
      include: tripInclude,
    });
  });
}

export async function deleteTrip(id: string) {
  const existing = await prisma.trip.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.trip.delete({ where: { id } });
  return true;
}
