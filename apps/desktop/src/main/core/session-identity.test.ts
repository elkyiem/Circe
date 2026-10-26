import { describe, expect, it } from "vitest";
import { identityKeyFromCookies } from "./session-identity";

describe("identityKeyFromCookies", () => {
  it("decodes the numeric user id out of twitter's twid cookie", () => {
    const key = identityKeyFromCookies("twitter", [
      { name: "auth_token", value: "abc" },
      { name: "twid", value: "u%3D783214" },
    ]);
    expect(key).toBe("783214");
  });

  it("falls back to the decoded twid when the u= shape is missing", () => {
    const key = identityKeyFromCookies("twitter", [
      { name: "twid", value: "opaque-id" },
    ]);
    expect(key).toBe("opaque-id");
  });

  it("uses ds_user_id for instagram and threads", () => {
    const cookies = [{ name: "ds_user_id", value: "123456" }];
    expect(identityKeyFromCookies("instagram", cookies)).toBe("123456");
    expect(identityKeyFromCookies("threads", cookies)).toBe("123456");
  });

  it("returns null when the identity cookie is absent or empty", () => {
    expect(identityKeyFromCookies("twitter", [])).toBeNull();
    expect(
      identityKeyFromCookies("instagram", [{ name: "ds_user_id", value: "" }]),
    ).toBeNull();
  });

  it("returns null for sources without a stable identity cookie", () => {
    expect(
      identityKeyFromCookies("pinterest", [{ name: "twid", value: "u=1" }]),
    ).toBeNull();
  });

  it("reads uid_tt for tiktok", () => {
    expect(
      identityKeyFromCookies("tiktok", [{ name: "uid_tt", value: "71234" }]),
    ).toBe("71234");
  });

  it("reads the numeric user id from a cosmos access token", () => {
    const payload = Buffer.from(JSON.stringify({ userId: 42 })).toString(
      "base64url",
    );
    const token = `eyJhbGciOiJub25lIn0.${payload}.sig`;
    expect(
      identityKeyFromCookies("cosmos", [
        { name: "csms_accessToken", value: token },
      ]),
    ).toBe("42");
  });

  it("reads the lid from a logged-in reddit token_v2", () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "user", lid: "t2_spez" }),
    ).toString("base64url");
    const token = `eyJhbGciOiJub25lIn0.${payload}.sig`;
    expect(
      identityKeyFromCookies("reddit", [{ name: "token_v2", value: token }]),
    ).toBe("t2_spez");
  });

  it("ignores anonymous reddit token_v2", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "loid" })).toString(
      "base64url",
    );
    const token = `eyJhbGciOiJub25lIn0.${payload}.sig`;
    expect(
      identityKeyFromCookies("reddit", [{ name: "token_v2", value: token }]),
    ).toBeNull();
  });

  it("reads the signed-in unsplash user id and ignores the visitor session", () => {
    expect(
      identityKeyFromCookies("unsplash", [
        { name: "un_sesh", value: "abc" },
        { name: "auth_user_id", value: "1810446" },
      ]),
    ).toBe("1810446");
    expect(
      identityKeyFromCookies("unsplash", [{ name: "un_sesh", value: "abc" }]),
    ).toBeNull();
  });
});
