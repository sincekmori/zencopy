import { cn } from "@/lib/utils.ts";

/**
 * The bordered one-active-segment control the settings surfaces share (tabs,
 * theme, text size): extracted so the look can never drift between copies.
 */
export function SegmentedControl<Value extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: Value;
  options: { value: Value; label: string }[];
  onChange: (value: Value) => void;
  /** Extra classes for the container (e.g. `w-fit` when not centered). */
  className?: string | undefined;
}): React.JSX.Element {
  return (
    <div className={cn("inline-flex rounded-lg border bg-muted/40 p-1", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            onChange(option.value);
          }}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
