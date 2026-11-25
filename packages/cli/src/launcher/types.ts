export interface LaunchConfig {
  execCommand: string;
  projectRoot: string;
  serverPort: number;
  debugPort: number;
  devPort?: number;
  proxyPort?: number;
  autoResolve?: boolean;
  args: any;
}

export interface AppLauncher {
  launch(config: LaunchConfig): Promise<void>;
}
