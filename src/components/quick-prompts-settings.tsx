import { emit } from "@tauri-apps/api/event";
import { GripVertical } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { type PromptInfo, listPrompts } from "@/lib/prompts.ts";
import { usePromptLabel, useT } from "@/lib/i18n.tsx";
import { createLogger } from "@/lib/log.ts";
import { getQuickPrompts, QUICK_SLOT_COUNT, setQuickPrompts } from "@/lib/settings.ts";
import { cn } from "@/lib/utils.ts";
import { Select } from "@/components/ui/select.tsx";

const log = createLogger("quick-prompts-settings");

/** The popup quick slots (number keys 1–N, QUICK_SLOT_COUNT of them): drag
 *  to reorder, pick the prompt per slot. Positions are stable so the numbers
 *  a user memorizes never move on their own; assignments stay duplicate-free
 *  (choosing a prompt already in another slot swaps the two). What runs by
 *  default is the routing section's business, not this one's. */
export function QuickPromptsSettings(): React.JSX.Element {
  const t = useT();
  const promptLabel = usePromptLabel();
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | undefined>(undefined);

  // useCallback deliberately: reload is a useEffect dependency below and must
  // stay referentially stable even if the compiler bails out here.
  const reload = useCallback((): void => {
    void (async () => {
      try {
        const [list, quick] = await Promise.all([listPrompts(), getQuickPrompts()]);
        setPrompts(list);
        setSlots(quick);
      } catch (error) {
        log.error("loading quick prompts failed", error);
      }
    })();
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Persist + broadcast so the popup's row updates live.
  const commit = (next: string[]): void => {
    setSlots(next);
    void (async () => {
      try {
        await setQuickPrompts(next);
        await emit("quick-prompts-changed", next);
      } catch (error) {
        log.error("saving quick prompts failed", error);
        reload();
      }
    })();
  };

  // Assign an prompt to a slot. If it already occupies another slot, swap them
  // so the slots stay distinct without ever leaving one empty.
  const assign = (slotIndex: number, id: string): void => {
    const next = [...slots];
    const existing = next.indexOf(id);
    if (existing !== -1 && existing !== slotIndex) {
      next[existing] = next[slotIndex] ?? id;
    }
    next[slotIndex] = id;
    commit(next);
  };

  const move = (from: number, to: number): void => {
    if (from === to) {
      return;
    }
    const next = [...slots];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) {
      return;
    }
    next.splice(to, 0, moved);
    commit(next);
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div>
        <h2 className="text-sm font-medium">{t.settings.quickTitle}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t.settings.quickHint}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {slots.map((id, index) => {
          const known = prompts.some((a) => a.id === id);
          return (
            // Slot order IS the identity here (the number is the slot), so the
            // index key is correct, not a fallback.
            // eslint-disable-next-line react/no-array-index-key
            <li key={index}>
              {/* Drag lives on this generic wrapper, not the <li> — a11y rules
                  reserve DnD handlers for non-semantic elements. */}
              <div
                draggable
                onDragStart={(event) => {
                  // WebKit won't start a drag without data on the transfer.
                  event.dataTransfer.setData("text/plain", String(index));
                  event.dataTransfer.effectAllowed = "move";
                  setDragIndex(index);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragIndex !== undefined) {
                    move(dragIndex, index);
                  }
                  setDragIndex(undefined);
                }}
                onDragEnd={() => {
                  setDragIndex(undefined);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-lg border bg-background/40 p-2 transition-colors",
                  dragIndex === index && "opacity-50",
                )}
              >
                <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/50" />
                <kbd className="flex size-6 shrink-0 items-center justify-center rounded border bg-muted font-mono text-xs text-muted-foreground">
                  {index + 1}
                </kbd>
                <Select
                  className="flex-1"
                  value={id}
                  onChange={(event) => {
                    assign(index, event.target.value);
                  }}
                >
                  {/* An id pointing at a deleted prompt stays listed raw, so the
                      slot's state is visible instead of silently blank. */}
                  {known ? undefined : <option value={id}>{id}</option>}
                  {prompts.map((prompt) => (
                    <option key={prompt.id} value={prompt.id}>
                      {promptLabel(prompt.id, prompt.label)}
                    </option>
                  ))}
                </Select>
              </div>
            </li>
          );
        })}
        {slots.length === 0 ? (
          <li className="text-xs text-muted-foreground">
            {Array.from({ length: QUICK_SLOT_COUNT })
              .map(() => "…")
              .join(" ")}
          </li>
        ) : undefined}
      </ul>
    </section>
  );
}
