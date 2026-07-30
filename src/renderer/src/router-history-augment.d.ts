












declare module "@tanstack/history" {
  interface HistoryState {
    /** Pathname of the page the user was on before navigating with this state. */
    from?: string;
  }
}
