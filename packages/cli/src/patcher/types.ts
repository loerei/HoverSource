export interface RuntimePatcher {
  patch(projectRoot: string): void;
  restore(): void;
}
