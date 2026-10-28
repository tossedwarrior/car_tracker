import { describe, expect, it } from "vitest";
import { connectionOptions } from "../../scripts/db-config.cjs";

describe("connectionOptions", () => {
  it("reads the DB_* variables GoDaddy sets for an app's hosted database", () => {
    expect(
      connectionOptions({ DB_HOST: "db.example", DB_PORT: "3307", DB_NAME: "app", DB_USER: "u", DB_PASSWORD: "p" }),
    ).toEqual({ host: "db.example", port: 3307, database: "app", user: "u", password: "p" });
  });

  it("reads DATABASE_URL, and says what's missing when nothing is set", () => {
    expect(connectionOptions({ DATABASE_URL: "mysql://u:p%40ss@localhost/tracker" })).toEqual({
      host: "localhost",
      port: 3306,
      database: "tracker",
      user: "u",
      password: "p@ss",
    });
    expect(() => connectionOptions({})).toThrow("No database set");
  });
});
