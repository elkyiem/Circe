import { type CurlResult, parseCurl } from "./api";

/** `doShellScript` throws on a non-zero exit, which for curl means Pond isn't listening. */
function shell(command: string): string | null {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  try {
    return app.doShellScript(command);
  } catch {
    return null;
  }
}

/** `doShellScript` turns `\n` into `\r`, which would hide the status line from `parseCurl`. */
export function request(command: string): CurlResult | null {
  const output = shell(command);
  return output === null ? null : parseCurl(output.replace(/\r/g, "\n"));
}
