import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { z } from "zod";

const PairSchema = z.object({
  id: z.uuid(),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  extension: z.string(),
  origin: z.string(),
  libraryId: z.string(),
  name: z.string(),
  expiresAt: z.number(),
});
const StoredSchema = z.object({
  version: z.literal(1),
  pairs: z.array(PairSchema).max(20),
});
const digest = (value: string) => createHash("sha256").update(value).digest();
const EXPIRY_MS = 90 * 24 * 60 * 60_000;

export async function openExtensionAuth({
  path,
  key,
  now = Date.now,
}: {
  path: string;
  key: string;
  now?: () => number;
}) {
  let pairs: z.infer<typeof PairSchema>[] = [];
  try {
    pairs = StoredSchema.parse(JSON.parse(await readFile(path, "utf8"))).pairs;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  }
  let tail = Promise.resolve();
  const change = (update: () => z.infer<typeof PairSchema>[]) => {
    const write = tail.then(async () => {
      const next = update();
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, pairs: next }), {
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, path);
      pairs = next;
    });
    tail = write.catch(() => {});
    return write;
  };
  const matches = (
    pair: z.infer<typeof PairSchema>,
    origin: string,
    libraryId: string,
  ) =>
    pair.expiresAt > now() &&
    pair.origin === origin &&
    pair.libraryId === libraryId;
  return {
    async pair(input: {
      key: string;
      name: string;
      extension: string;
      origin: string;
      libraryId: string;
      replaceToken?: string;
    }) {
      if (!timingSafeEqual(digest(input.key), digest(key))) return null;
      const token = randomBytes(32).toString("base64url");
      const pair = {
        id: randomUUID(),
        digest: digest(token).toString("hex"),
        extension: input.extension,
        origin: input.origin,
        libraryId: input.libraryId,
        name: input.name,
        expiresAt: now() + EXPIRY_MS,
      };
      const replaced = input.replaceToken
        ? digest(input.replaceToken).toString("hex")
        : null;
      await change(() => [
        ...pairs
          .filter(
            (old) =>
              old.expiresAt > now() &&
              !(
                old.digest === replaced &&
                old.extension === pair.extension &&
                old.origin === pair.origin &&
                old.libraryId === pair.libraryId
              ),
          )
          .slice(-19),
        pair,
      ]);
      return { token, expiresAt: pair.expiresAt };
    },
    valid(token: string, extension: string, origin: string, libraryId: string) {
      const presented = digest(token);
      return pairs.some(
        (pair) =>
          matches(pair, origin, libraryId) &&
          pair.extension === extension &&
          timingSafeEqual(Buffer.from(pair.digest, "hex"), presented),
      );
    },
    list(libraryId: string) {
      return pairs
        .filter(
          (pair) => pair.libraryId === libraryId && pair.expiresAt > now(),
        )
        .map(({ id, name, origin, expiresAt }) => ({
          id,
          name,
          origin,
          expiresAt,
        }));
    },
    hasPair(libraryId: string) {
      return pairs.some(
        (pair) => pair.libraryId === libraryId && pair.expiresAt > now(),
      );
    },
    revoke(
      token: string,
      extension: string,
      origin: string,
      libraryId: string,
    ) {
      const hash = digest(token).toString("hex");
      return change(() =>
        pairs.filter(
          (pair) =>
            !(
              matches(pair, origin, libraryId) &&
              pair.extension === extension &&
              pair.digest === hash
            ),
        ),
      );
    },
    revokeAll(libraryId: string) {
      return change(() => pairs.filter((pair) => pair.libraryId !== libraryId));
    },
  };
}
export type ExtensionAuth = Awaited<ReturnType<typeof openExtensionAuth>>;
