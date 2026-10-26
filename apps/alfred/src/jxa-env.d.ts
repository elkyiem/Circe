declare const Application: {
  currentApplication(): {
    includeStandardAdditions: boolean;
    doShellScript(command: string): string;
  };
};
