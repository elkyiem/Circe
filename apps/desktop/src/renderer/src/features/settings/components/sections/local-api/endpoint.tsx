import { Button, Settings } from "@pond/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { hostDeviceName } from "@/shared/lib/platform";

export function LocalApiEndpoint() {
  const status = useQuery({
    queryKey: ["local-api-status"],
    queryFn: () => window.pond.query("api.status", {}),
    refetchInterval: 5000,
  });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = status.data?.state === "listening" ? status.data.url : null;
  return (
    <Settings.Item>
      <Settings.ItemDetails>
        <Settings.ItemTitle>API on {hostDeviceName()}</Settings.ItemTitle>
        <Settings.ItemDescription>
          {endpoint ? (
            <>
              Use <code>{endpoint}</code> as Raycast’s Base URL on{" "}
              {hostDeviceName()}.
            </>
          ) : status.data?.state === "failed" ? (
            status.data.error
          ) : status.isError ? (
            "Couldn’t read the API status."
          ) : status.isPending ? (
            "Checking the API…"
          ) : (
            "The Local API is not running."
          )}
          {error ? <span role="alert">{error}</span> : null}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      {endpoint ? (
        <Settings.ItemControl>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              setError(null);
              try {
                const result = await window.pond.query("clipboard.writeText", {
                  text: endpoint,
                });
                if (!result.ok) throw new Error("Couldn’t copy the API URL.");
                setCopied(true);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Couldn’t copy the API URL.",
                );
              }
            }}
          >
            {copied ? "Copied URL" : "Copy API URL"}
          </Button>
        </Settings.ItemControl>
      ) : null}
    </Settings.Item>
  );
}
