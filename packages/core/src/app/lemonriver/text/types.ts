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
};
