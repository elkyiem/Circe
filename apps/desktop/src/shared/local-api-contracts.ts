export interface LocalApiStatus {
  state: "disabled" | "stopped" | "listening" | "failed";
  url: string | null;
  error: string | null;
}
