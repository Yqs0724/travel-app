import { useOutletContext, useParams } from "react-router-dom";
import { parseMembers, type TripDetail } from "@/api/trips";
import { ExpensePanel } from "@/features/budget/ExpensePanel";

type Ctx = {
  trip: TripDetail | null;
};

export function BudgetPage() {
  const { id } = useParams<{ id: string }>();
  const { trip } = useOutletContext<Ctx>();
  const members = trip ? parseMembers(trip.members) : [];

  if (!id) return null;

  return <ExpensePanel tripId={id} members={members} />;
}
