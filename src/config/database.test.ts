import { types } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import { database } from "@/config/database.js";

// Regressão: sem listener de "error" no Pool, quando o Postgres reinicia a
// conexão ociosa emite "error" e o Node derruba o processo inteiro (o
// api-alertas caiu assim no ambiente do Docker).
describe("pool do banco", () => {
  afterAll(async () => {
    await database.end();
  });

  it("não derruba o processo quando uma conexão ociosa cai", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(database.listenerCount("error")).toBeGreaterThan(0);
    expect(() =>
      database.emit("error", new Error("terminating connection")),
    ).not.toThrow();
    expect(log).toHaveBeenCalled();

    log.mockRestore();
  });

  it("lê timestamp sem fuso como UTC, independente do TZ do processo", () => {
    const parse = types.getTypeParser(types.builtins.TIMESTAMP);

    expect(parse("2026-09-25 13:07:56.123")).toEqual(
      new Date("2026-09-25T13:07:56.123Z"),
    );
  });
});
