import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils.ts";

// Native <select> stripped of engine theming (appearance-none). Themed
// selects render differently per engine: macOS WebKit ignores vertical
// padding, while WebKitGTK honors it on top of its own intrinsic metrics and
// clips the text when a fixed height caps the result. A plain box with our
// own chevron lays out like a text input everywhere (border 2 + padding 12 +
// text-sm line 20 = 34px), so mixed rows line up without per-engine height
// hacks. Sizing classes (w-56, flex-1, …) go on the wrapper via className;
// all other props land on the <select> itself.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="select" className={cn("relative", className)}>
      <select
        className="w-full appearance-none rounded-md border bg-background py-1.5 ps-3 pe-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        {...props}
      />
      <ChevronDown className="pointer-events-none absolute inset-e-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export { Select };
