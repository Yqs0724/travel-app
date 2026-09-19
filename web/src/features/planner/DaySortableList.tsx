import { Fragment, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { isErr } from "@/api/client";
import {
  itemTitle,
  legLabel,
  reorderItems,
  type ItineraryItem,
  type TripDay,
  type WriteOpts,
} from "@/api/planner";

function SortRow({
  item,
  index,
  active,
  onOpen,
}: {
  item: ItineraryItem;
  index: number;
  active: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasDetail =
    item.needBook ||
    (item.ticketPrice != null && item.ticketPrice > 0) ||
    (item.legToNext?.cost != null && item.legToNext.cost > 0);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-stretch ${isDragging ? "relative z-10 opacity-90" : ""}`}
    >
      <button
        type="button"
        className="flex w-7 shrink-0 touch-none items-center justify-center text-ink-muted"
        aria-label="拖动排序"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        className={`flex min-w-0 flex-1 gap-2 rounded-btn px-1.5 py-3 text-left ${
          hasDetail ? "items-start" : "items-center"
        } ${active ? "bg-accent/25" : ""}`}
        onClick={onOpen}
      >
        <span
          className={`flex w-6 shrink-0 items-center justify-center text-sm font-semibold tabular-nums text-accent-dark ${
            hasDetail ? "pt-0.5" : ""
          }`}
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[15px] ${active ? "font-semibold" : "font-medium"}`}
          >
            {itemTitle(item)}
          </span>
          {(item.ticketPrice != null && item.ticketPrice > 0) ||
          (item.legToNext?.cost != null && item.legToNext.cost > 0) ? (
            <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
              {item.ticketPrice != null && item.ticketPrice > 0
                ? `参考门票 ¥${item.ticketPrice}`
                : ""}
              {item.ticketPrice != null &&
              item.ticketPrice > 0 &&
              item.legToNext?.cost != null &&
              item.legToNext.cost > 0
                ? " · "
                : ""}
              {item.legToNext?.cost != null && item.legToNext.cost > 0
                ? `参考路费 ¥${item.legToNext.cost}`
                : ""}
            </span>
          ) : null}
        </span>
        {item.needBook && <span className="shrink-0 text-[11px] text-info">预约</span>}
      </button>
    </li>
  );
}

export function DaySortableList({
  day,
  focusId,
  onOpen,
  onDayChange,
  writeOpts,
}: {
  day: TripDay;
  focusId: string | null;
  onOpen: (item: ItineraryItem, index: number) => void;
  onDayChange: (day: TripDay) => void;
  writeOpts?: WriteOpts;
}) {
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const ids = day.items.map((i) => i.id);

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextIds = arrayMove(ids, oldIndex, newIndex);
    // 乐观更新序号展示
    const optimistic: TripDay = {
      ...day,
      items: nextIds.map((id, seq) => {
        const it = day.items.find((x) => x.id === id)!;
        return { ...it, seq };
      }),
    };
    onDayChange(optimistic);
    const res = await reorderItems(day.id, nextIds, writeOpts);
    if (isErr(res)) {
      setError(res.message);
      onDayChange(day);
      return;
    }
    setError(null);
    onDayChange(res.data);
  }

  return (
    <>
      {error && <p className="py-1 text-xs text-danger">{error}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(ev) => void onDragEnd(ev)}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul>
            {day.items.map((item, index) => (
              <Fragment key={item.id}>
                <SortRow
                  item={item}
                  index={index}
                  active={focusId === item.id}
                  onOpen={() => onOpen(item, index)}
                />
                {index < day.items.length - 1 && item.legToNext && (
                  <li className="pb-1 pl-[3.4rem] text-[11px] text-ink-muted">
                    {legLabel(item.legToNext)}
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}
