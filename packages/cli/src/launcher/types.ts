export interface LaunchConfig {
  execCommand: string;
  projectRoot: string;
  serverPort: number;
  debugPort: number;
  args: any;
}

export interface AppLauncher {
  launch(config: LaunchConfig): Promise<void>;
}
