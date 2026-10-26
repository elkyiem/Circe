import { describe, expect, it } from "vitest";
import { loginFromCookies } from "./account";

describe("loginFromCookies", () => {
  it("reads the login only while signed in", () => {
    const login = { name: "dotcom_user", value: "octo%2Dcat" };
    expect(loginFromCookies([{ name: "logged_in", value: "yes" }, login])).toBe(
      "octo-cat",
    );
    expect(
      loginFromCookies([{ name: "logged_in", value: "no" }, login]),
    ).toBeNull();
  });
});
