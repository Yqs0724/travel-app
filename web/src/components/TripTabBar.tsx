import { NavLink } from "react-router-dom";
import { IconCheckList, IconMap, IconNearby, IconSpark, IconWallet } from "@/components/Icons";

const tabs = [
  { to: "plan", label: "行程", Icon: IconMap },
  { to: "nearby", label: "周边", Icon: IconNearby },
  { to: "ai", label: "AI", Icon: IconSpark },
  { to: "checklist", label: "清单", Icon: IconCheckList },
  { to: "budget", label: "记账", Icon: IconWallet },
] as const;

export function TripTabBar({ tripId }: { tripId: string }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:static lg:z-auto lg:w-auto lg:border-0 lg:bg-transparent lg:pb-0">
      <div className="mx-auto flex h-14 max-w-[480px] items-stretch justify-around lg:h-9 lg:max-w-none lg:items-center lg:gap-0.5">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={`/trips/${tripId}/${t.to}`}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] lg:flex-none lg:flex-row lg:gap-1 lg:rounded-btn lg:px-2.5 lg:py-1 lg:text-sm ${
                isActive ? "text-accent-dark font-medium lg:bg-accent/25" : "text-ink-muted"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <t.Icon size={22} className={isActive ? "opacity-100" : "opacity-80"} />
                <span>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
