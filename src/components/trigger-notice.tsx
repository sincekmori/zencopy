import { useT } from "@/lib/i18n.tsx";
import { IS_MAC } from "@/lib/platform.ts";
import { type TriggerStatus, useTriggerStatus } from "@/lib/trigger-status.ts";

/** The notice text for a status, or undefined for states that need no UI
 *  (listening, or listening via an older GNOME extension). */
function noticeText(
  status: TriggerStatus | undefined,
  t: ReturnType<typeof useT>,
): string | undefined {
  switch (status?.kind) {
    case "gnome_extension_awaiting_login": {
      return t.trigger.awaitingLogin;
    }
    case "unsupported_session": {
      return t.trigger.unsupportedSession;
    }
    case "failed": {
      // On macOS the listener failing to start means the Input Monitoring /
      // Accessibility permissions are missing — say so instead of pointing at
      // the log.
      return IS_MAC ? t.trigger.macosPermissions : t.trigger.failed;
    }
    default: {
      return undefined;
    }
  }
}

/** A calm inline notice for trigger states the user must know about — shown
 *  in the welcome screen and the settings window. Without it, a dormant
 *  trigger (Linux: GNOME extension pending a relogin, or an unsupported
 *  compositor) fails silently. */
export function TriggerNotice(): React.JSX.Element | undefined {
  const t = useT();
  const status = useTriggerStatus();
  const text = noticeText(status, t);
  if (text === undefined) {
    return undefined;
  }

  return (
    <output className="block rounded-lg border border-amber-600/40 bg-amber-500/10 px-4 py-3 text-start text-xs leading-relaxed text-amber-800 dark:text-amber-300">
      {text}
    </output>
  );
}
