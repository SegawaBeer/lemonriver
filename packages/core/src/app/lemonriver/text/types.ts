import type { Plural } from '../../../locale/types';

export type LrText = {
  board: {
    title: string;
    openBoard: string;
    backToDeck: string;
    hint: string;
    loading: string;
    /** template: "Part {n}" — columns in decks that declare no chapter pages. */
    columnFallback: string;
    moveToEnd: string;
    reorderFailed: string;
    zoomIn: string;
    zoomOut: string;
    fitView: string;
    saveFailed: string;
    renameColumn: string;
    columnTitlePlaceholder: string;
    addPage: string;
    notesPlaceholder: string;
    /** template: "Added a blank page at {n}" */
    toastInserted: string;
    insertFailed: string;
    cardTitlePlaceholder: string;
    renameCard: string;
    status: string;
    statusNone: string;
    statusTodo: string;
    statusDoing: string;
    statusReview: string;
    statusDone: string;
    memoPlaceholder: string;
    linkHandle: string;
    showLinks: string;
    hideLinks: string;
    removeLink: string;
  };
  theme: {
    lime: string;
  };
  shell: {
    newDeck: string;
    /** The dashed card that opens the grid; differs from newDeck so each control has its own name. */
    newDeckCard: string;
    /** The dashed card's label when it opens the guided flow instead. */
    newDeckGuided: string;
    settings: string;
    trash: string;
    offline: string;
  };
  home: {
    greetingMorning: string;
    greetingAfternoon: string;
    greetingEvening: string;
    subtitle: string;
    briefLabel: string;
    briefPlaceholder: string;
    briefStart: string;
    briefNeedsAgent: string;
    /** template: "{n} pages" */
    pages: Plural;
    editing: string;
    moveToTrash: string;
    /** template: "Moved “{name}” to the trash" */
    toastTrashed: string;
    toastTrashFailed: string;
    /** template: "Restored “{name}”" */
    toastRestored: string;
    toastRestoreFailed: string;
    undo: string;
    renameHint: string;
    nameRequired: string;
    noMatchesHint: string;
  };
  trash: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyHint: string;
    /** template: "Deleted {when}" */
    deletedWhen: string;
    /** template: "{n} days left" */
    daysLeft: Plural;
    restore: string;
    deleteForever: string;
    confirmTitle: string;
    /** template: "Type {name} to delete it for good. This can't be undone." */
    confirmHint: string;
    confirmLabel: string;
    /** template: "Deleted “{name}” for good" */
    toastPurged: string;
    toastPurgeFailed: string;
    loadFailed: string;
  };
  settings: {
    title: string;
    subtitle: string;
    appearance: string;
    appearanceHint: string;
    reduceMotion: string;
    reduceMotionHint: string;
  };
  feedback: {
    notFoundHint: string;
    backHome: string;
    exportFailedHint: string;
    /** template: "The file is over {limit} MB" */
    uploadTooLarge: string;
    uploadTooLargeHint: string;
    confirmWho: string;
  };
  update: {
    /** template: "LemonRiver {version} is available" */
    title: string;
    /** template: "You're on {current}. Updating installs the new version and syncs skills; restart the local server to use it." */
    hint: string;
    now: string;
    later: string;
    updating: string;
    /** template: "Updated to {version}" */
    updated: string;
    updatedHint: string;
    updatedManual: string;
    restart: string;
    failed: string;
    failedHint: string;
    retry: string;
    beta: string;
    betaTitle: string;
    betaHint: string;
  };
  outline: {
    stepDescribe: string;
    stepOutline: string;
    stepBuild: string;
    stepDone: string;
    describeTitle: string;
    describePlaceholder: string;
    pagesLabel: string;
    filesLabel: string;
    addFile: string;
    removeFile: string;
    draftOutline: string;
    startFailed: string;
    tooLargeTitle: string;
    /** template: "{name} is {size} MB. Compress the image, or upload a text version instead." */
    tooLargeHint: string;
    replaceFile: string;
    /** template: "{name} cannot be opened" */
    lockedTitle: string;
    lockedHint: string;
    reupload: string;
    skipFile: string;
    /** template: "{name} cannot be read" */
    unsupportedTitle: string;
    unsupportedHint: string;
    /** template: "Reading {n} files, then listing the outline…" */
    drafting: string;
    draftingNoFiles: string;
    failedTitle: string;
    failedHint: string;
    retry: string;
    editBrief: string;
    addPage: string;
    /** template: "{n} pages" */
    total: string;
    build: string;
    moveUp: string;
    moveDown: string;
    removePage: string;
    dragPage: string;
    /** template: "Title of page {n}" */
    pageTitle: string;
    kindCover: string;
    kindKpi: string;
    kindChart: string;
    kindList: string;
    kindPage: string;
    kindEnd: string;
    back: string;
  };
};
