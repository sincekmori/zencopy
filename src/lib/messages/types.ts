// The i18n contract. Every locale file is annotated `: Messages`, so the
// compiler forces each one to provide exactly these keys — a missing or extra
// key in any language is a build error, not a runtime surprise.

export interface Messages {
  /** Genuinely universal words, identical in every context they appear in.
   *  Everything context-specific stays in its own section — a word whose
   *  translation could depend on what it refers to must not live here. */
  common: {
    save: string;
    saved: string;
    cancel: string;
  };
  settings: {
    title: string;
    tagline: (keys: string) => string;
    tabGeneral: string;
    position: string;
    positionHint: string;
    cornerTopLeft: string;
    cornerTopRight: string;
    cornerBottomLeft: string;
    cornerBottomRight: string;
    theme: string;
    themeHint: string;
    language: string;
    languageHint: string;
    startup: string;
    startupHint: string;
    confirmSend: string;
    confirmSendHint: string;
    devMode: string;
    devModeHint: string;
    /** "About you": one free-form multiline self-description, added to every
     *  action run so results fit the person asking. The placeholders are
     *  example personas the field rotates through; Tab inserts the one
     *  currently shown. */
    userContext: string;
    userContextHint: string;
    userContextPlaceholders: string[];
    userContextClear: string;
    /** Confirmation after the clear button wiped the stored value. */
    userContextCleared: string;
    quickTitle: string;
    quickHint: string;
    resetTitle: string;
    resetHint: string;
    resetButton: string;
    resetWarning: string;
    resetConfirm: string;
    optionSystem: string;
    optionLight: string;
    optionDark: string;
  };
  popup: {
    placeholder: string;
    devVars: string;
    noAction: string;
    routingDocs: string;
    confirmSend: string;
    send: string;
    dontAskAgain: string;
    attachmentTooLarge: (mb: number) => string;
    unsupportedFile: (name: string) => string;
    fileUnreadable: (name: string) => string;
    switchAction: string;
    chooseAction: string;
    defaultTag: string;
    setDefault: (label: string) => string;
    failed: (reason: string) => string;
    timedOut: string;
    emptyResult: string;
    stop: string;
    retry: string;
    copy: string;
    copied: string;
    clear: string;
    close: string;
    openSettings: string;
    /** Whisper-level footer line while an update is pending ("update
     *  available" phrasing, not restart mechanics); clicking opens About. */
    updateHint: (version: string) => string;
  };
  source: {
    /** Eyebrow over the copied content, so it reads as the input, not output. */
    inputLabel: string;
    richText: string;
    emptyClipboard: string;
    imageAlt: string;
    cannotPreview: string;
  };
  markdown: {
    /** Confirmation shown before a clicked link in model output goes to the
     *  browser; the real URL is displayed alongside, since the link text can
     *  lie about the destination. */
    openLink: string;
    open: string;
  };
  about: {
    version: string;
    tagline: string;
    /** The update button before the download finished (rare: a failed or
     *  still-running background download) — clicking downloads and installs.
     *  Say "restart the app" explicitly: a bare "restart" reads as the OS. */
    update: (version: string) => string;
    /** The update button once the new version is already downloaded —
     *  restarting the app is all that is left to do. */
    updateRestart: (version: string) => string;
    updating: string;
    privacy: string;
    terms: string;
  };
  welcome: {
    title: string;
    /** Primary CTA — starts with the entered key; disabled while empty. */
    start: string;
    keyLabel: string;
    keyHint: string;
    /** Secondary CTA — skips the key and opens the full provider settings. */
    otherSetup: string;
  };
  trigger: {
    /** Linux, GNOME Wayland: the trigger extension is installed but GNOME only
     *  loads extensions at login — one logout/login, then relaunch. */
    awaitingLogin: string;
    /** Linux: a Wayland compositor with no capture path (not GNOME). */
    unsupportedSession: string;
    /** The trigger listener failed to start; details are in the log. */
    failed: string;
  };
  actions: {
    /** Localized display labels for pre-installed actions, keyed by action id.
     *  The ids live in Rust (DEFAULT_ACTIONS), so this is an open map rather
     *  than fixed keys; a missing id falls back to the action's own (English)
     *  label from its .md file. User actions are always shown verbatim. */
    builtinLabels: Record<string, string>;
    title: string;
    hint: (keys: string) => string;
    add: string;
    export: string;
    import: string;
    importHint: string;
    /** The native-file-picker import button. */
    importFromFile: string;
    name: string;
    instruction: string;
    instructionPlaceholder: string;
    draft: string;
    draftHint: string;
    draftFailed: string;
    advanced: string;
    template: string;
    templateHint: string;
    templateDocs: string;
    roleLabel: string;
    view: string;
    edit: string;
    remove: string;
    setDefault: string;
    /** Tooltip on the disabled delete button of the current default action. */
    cannotDeleteDefault: string;
    failed: (reason: string) => string;
    /** Import failures, mapped from the structured error codes import_action
     *  (src-tauri) rejects with; `id` is the offending action id. `label` and
     *  `id` name literal fields of the action file — keep them untranslated. */
    importNotAnAction: string;
    importNoLabel: string;
    importInvalidId: (id: string) => string;
    importBuiltinId: (id: string) => string;
    importIdExists: (id: string) => string;
    importTooLarge: string;
    /** Rejection for a save or import whose label duplicates an existing
     *  action's — labels are the only identity users see, so they must stay
     *  unique. Used for both the frontend pre-check and the Rust backstop. */
    labelExists: (label: string) => string;
  };
  routing: {
    title: string;
    hint: string;
    kindText: string;
    kindRichText: string;
    kindImage: string;
    kindFiles: string;
    none: string;
    overridesTitle: string;
    overridesHint: string;
    overridesDocs: string;
    addOverride: string;
    anyKind: string;
    fieldKind: string;
    fieldApp: string;
    fieldExec: string;
    fieldTitle: string;
    fieldUrl: string;
    fieldMinChars: string;
    fieldMaxChars: string;
    ruleAction: string;
    wildcardHint: string;
    needsCondition: string;
    needsValidBounds: string;
    moveUp: string;
    moveDown: string;
  };
  ai: {
    title: string;
    hint: string;
    disclosure: string;
    provider: string;
    providerCompatible: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    apiKeyHint: string;
    /** The JSON editor's privacy veil (and its close toggle) — API keys stay
     *  masked behind it until the veil is clicked. */
    revealKeys: string;
    freeKeyLink: string;
    test: string;
    testOk: string;
    testUnreachable: string;
    advancedHint: string;
    examplesLink: string;
    invalidJson: string;
    invalidSchema: string;
    saveFailed: string;
    invalidConfig: string;
    notConfigured: string;
  };
}
