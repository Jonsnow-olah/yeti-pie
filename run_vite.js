if (!globalThis.CustomEvent) {
  class CustomEvent extends Event {
    constructor(message, options) {
      super(message, options);
      this.detail = options?.detail ?? null;
    }
  }
  globalThis.CustomEvent = CustomEvent;
}

// Launch the Vite CLI
await import('./node_modules/vite/dist/node/cli.js');
