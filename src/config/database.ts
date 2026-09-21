import { Pool, types } from "pg";

import { env } from "@/config/environment.js";

// O driver pg devolve bigint (int8, OID 20) como string, para não perder
// precisão além de Number.MAX_SAFE_INTEGER. Como o contrato de API define
// esses campos como number, a resposta JSON sairia com "id": "1" e quebraria
// o front. Ids de leituras e alertas não chegam nem perto do limite seguro
// (9 quatrilhões), então converter é seguro.
types.setTypeParser(types.builtins.INT8, (value) => Number(value));

export const database = new Pool({
  connectionString: env.DATABASE_URL,
});
