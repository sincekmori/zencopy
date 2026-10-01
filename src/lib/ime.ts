/** Whether a key press belongs to an IME composition — the Esc cancelling a
 *  conversion, the Enter committing one, a digit picking a candidate — and so
 *  is the IME's to handle, not the app's. Safari reports the key that ends a
 *  composition with `isComposing` already false but the legacy keyCode 229,
 *  so both are looked at. */
export function isImeKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}
