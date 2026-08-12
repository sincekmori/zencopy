import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

/** A modal confirmation for consequential choices (turning off statistics,
 *  resets, deleting a prompt): a question the user must answer before the
 *  action runs, Radix AlertDialog underneath (focus trap, Escape, no
 *  click-outside dismissal). Controlled: the caller owns `open` and closes it
 *  from both callbacks — `onConfirm` is NOT auto-closing, so a busy action
 *  (factory reset) can keep the dialog up, spinner on, until it lands. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Style the confirm button as destructive (deletes, resets). */
  destructive?: boolean;
  /** Keep the dialog up with a spinner and both buttons disabled. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          onCancel();
        }
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-background/50" />
        <AlertDialogPrimitive.Content className="fixed inset-x-0 top-1/2 z-50 mx-auto flex w-96 max-w-[calc(100vw-2rem)] -translate-y-1/2 flex-col gap-3 rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl">
          <AlertDialogPrimitive.Title className="text-sm font-semibold">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="mt-1 flex items-center justify-end gap-3">
            <AlertDialogPrimitive.Cancel asChild>
              <Button size="sm" variant="ghost" disabled={busy}>
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button
              size="sm"
              variant={destructive ? "destructive" : "default"}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : undefined}
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
