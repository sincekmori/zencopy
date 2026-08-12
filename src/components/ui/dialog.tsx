import { Dialog as DialogPrimitive } from "radix-ui";
import { DIALOG_CARD, DIALOG_OVERLAY, DIALOG_TITLE } from "@/components/ui/dialog-shell.ts";
import { cn } from "@/lib/utils.ts";

/** A modal overlay for forms and viewers (the prompt editor, the import box,
 *  the rule editor): Radix Dialog underneath (portal, focus trap, scroll
 *  lock, Escape). Clicking outside does NOT dismiss — typed content must
 *  never vanish under a stray click; closing is Escape or the form's own
 *  buttons. Content scrolls within the card when it outgrows the window. */
export function FormDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={DIALOG_OVERLAY} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
          className={cn(DIALOG_CARD, "max-h-[calc(100vh-2rem)] w-[30rem] overflow-y-auto")}
        >
          <DialogPrimitive.Title className={DIALOG_TITLE}>{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
