import { Button, Field, Input } from "@pond/ui";
import { useState } from "react";
import { connectFlow } from "@/features/sources/state/connect-flow";
import styles from "./styles.module.css";

interface HandleFormProps {
  label: string;
  notFound: boolean;
}

export function HandleForm({ label, notFound }: HandleFormProps) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    await connectFlow.submitHandle(handle);
    setBusy(false);
  };
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field.Root invalid={notFound || undefined}>
        <Field.Label>Your {label} Handle</Field.Label>
        <Input.Root>
          <Input.Prefix>@</Input.Prefix>
          <Input.Field
            autoFocus
            value={handle}
            placeholder="you.bsky.social"
            spellCheck={false}
            autoCapitalize="none"
            onChange={(event) => setHandle(event.target.value)}
          />
        </Input.Root>
        {notFound ? (
          <Field.Error match>
            Pond couldn't find that handle. Check the spelling and try again.
          </Field.Error>
        ) : (
          <Field.Description>
            Pond reads your public likes. You don't sign in.
          </Field.Description>
        )}
      </Field.Root>
      <Button type="submit" disabled={busy || handle.trim().length === 0}>
        {busy ? "Connecting" : "Connect"}
      </Button>
    </form>
  );
}
