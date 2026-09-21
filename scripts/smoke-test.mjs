// Bateria de verificação manual da API de alertas e do motor de regras,
// contra um servidor já em execução.
//
//   npm run dev          (num terminal)
//   npm run smoke        (noutro)
//
// Opções:
//   npm run smoke -- --url http://localhost:3002 --sensor-id 2
//   npm run smoke -- --sem-motor      pula os testes do motor de regras
//
// Os testes do motor inserem leituras no banco, o que exige DATABASE_URL —
// lido do .env, o mesmo que o servidor usa.

import "dotenv/config";

import pg from "pg";

const args = process.argv.slice(2);
const valorDe = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : padrao;
};
const temFlag = (nome) => args.includes(`--${nome}`);

const BASE = valorDe("url", "http://localhost:3002").replace(/\/$/, "");
const SENSOR_ID = Number(valorDe("sensor-id", "1"));
const TESTAR_MOTOR = !temFlag("sem-motor");

const sufixo = Date.now().toString(16).slice(-6).toUpperCase();
const MARCA = `Smoke ${sufixo}`;

let passou = 0;
let falhou = 0;
const configsCriadas = [];

async function chamar(metodo, caminho, corpo) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const texto = await resposta.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }

  return { status: resposta.status, json };
}

function verificar(descricao, condicao, detalhe) {
  if (condicao) {
    passou++;
    console.log(`  ok   ${descricao}`);
  } else {
    falhou++;
    console.log(`  FALHA ${descricao}`);
    if (detalhe !== undefined)
      console.log(`         recebido: ${JSON.stringify(detalhe)}`);
  }
}

console.log(`Smoke test em ${BASE}`);
console.log(`sensor_id ${SENSOR_ID}, marca "${MARCA}"\n`);

// --- disponibilidade -------------------------------------------------------
let saude;
try {
  saude = await chamar("GET", "/health");
  verificar("/health responde 200", saude.status === 200, saude.json);
  verificar(
    "/health informa o estado do motor",
    "rules_engine" in (saude.json ?? {}),
    saude.json,
  );
} catch (erro) {
  console.error(`\nNão consegui falar com ${BASE}.`);
  console.error(`Suba o servidor com "npm run dev" antes de rodar o smoke.`);
  console.error(`(${erro.message})`);
  process.exit(1);
}

// --- CRUD de configuração --------------------------------------------------
console.log("\nConfiguração de alerta");
const baseConfig = {
  sensor_id: SENSOR_ID,
  reference_value: 35,
  comparison_operator: ">",
  message: `${MARCA} critico`,
};

const criacao = await chamar("POST", "/api/alerts/config", baseConfig);

if (criacao.status === 409 && criacao.json?.code === "SENSOR_NOT_FOUND") {
  console.error(`\n  O sensor ${SENSOR_ID} não existe no banco.`);
  console.error(
    `  Crie um sensor (ver README, seção "Sensor de teste") e rode:`,
  );
  console.error(`    npm run smoke -- --sensor-id <id>`);
  process.exit(1);
}

verificar("POST válido devolve 201", criacao.status === 201, criacao.json);
verificar(
  "id vem como número",
  typeof criacao.json?.id === "number",
  criacao.json?.id,
);
verificar(
  "active começa true por padrão",
  criacao.json?.active === true,
  criacao.json?.active,
);
const configId = criacao.json?.id;
if (configId) configsCriadas.push(configId);

const comDefaults = await chamar("POST", "/api/alerts/config", {
  sensor_id: SENSOR_ID,
  reference_value: 10,
  comparison_operator: "<",
});
verificar(
  "campos opcionais assumem padrão",
  comDefaults.status === 201,
  comDefaults.json,
);
verificar(
  "manager_user_id padrão é nulo",
  comDefaults.json?.manager_user_id === null,
);
verificar("message padrão é nulo", comDefaults.json?.message === null);
if (comDefaults.json?.id) configsCriadas.push(comDefaults.json.id);

console.log("\nValidação");
const operadorInvalido = await chamar("POST", "/api/alerts/config", {
  ...baseConfig,
  comparison_operator: "<>",
});
verificar(
  "operador inválido devolve 400",
  operadorInvalido.status === 400,
  operadorInvalido.status,
);

const semSensor = await chamar("POST", "/api/alerts/config", {
  reference_value: 10,
  comparison_operator: ">",
});
verificar(
  "sem sensor_id devolve 400",
  semSensor.status === 400,
  semSensor.status,
);

const mensagemLonga = await chamar("POST", "/api/alerts/config", {
  ...baseConfig,
  message: "a".repeat(201),
});
verificar(
  "message acima de 200 caracteres devolve 400",
  mensagemLonga.status === 400,
  mensagemLonga.status,
);

const sensorInexistente = await chamar("POST", "/api/alerts/config", {
  ...baseConfig,
  sensor_id: 999999,
});
verificar(
  "sensor inexistente devolve 409",
  sensorInexistente.status === 409,
  sensorInexistente.status,
);

console.log("\nLeitura e atualização");
const lista = await chamar("GET", "/api/alerts/config?page=1&limit=5");
verificar("listagem devolve 200", lista.status === 200, lista.status);
verificar(
  "meta tem os três campos do contrato",
  ["total_records", "total_pages", "current_page"].every(
    (k) => k in (lista.json?.meta ?? {}),
  ),
  lista.json?.meta,
);

const porId = await chamar("GET", `/api/alerts/config/${configId}`);
verificar("busca por id devolve 200", porId.status === 200, porId.status);

const naoExiste = await chamar("GET", "/api/alerts/config/999999");
verificar(
  "id inexistente devolve 404",
  naoExiste.status === 404,
  naoExiste.status,
);
verificar(
  "código é ALERT_CONFIG_NOT_FOUND",
  naoExiste.json?.code === "ALERT_CONFIG_NOT_FOUND",
  naoExiste.json?.code,
);

const atualizada = await chamar("PUT", `/api/alerts/config/${configId}`, {
  ...baseConfig,
  reference_value: 40,
});
verificar("PUT devolve 200", atualizada.status === 200, atualizada.status);
verificar(
  "reference_value mudou",
  Number(atualizada.json?.reference_value) === 40,
  atualizada.json?.reference_value,
);

// --- motor de regras -------------------------------------------------------
let cliente = null;
// Só o que este teste inseriu: a limpeza apaga por id, nunca por valor, para
// não tocar leituras de outra pessoa no banco compartilhado.
const leiturasInseridas = [];
// Checkpoint do motor antes do teste (undefined = ainda não lido; null = não existia).
let checkpointOriginal;

if (!TESTAR_MOTOR) {
  console.log("\nMotor de regras: pulado (--sem-motor)");
} else if (!process.env.DATABASE_URL) {
  console.log("\nMotor de regras: pulado (DATABASE_URL não definida no .env)");
} else {
  console.log("\nMotor de regras");

  cliente = new pg.Client({
    connectionString: process.env.DATABASE_URL.trim().replace(
      /^[<"']+|[>"']+$/g,
      "",
    ),
    connectionTimeoutMillis: 20000,
  });

  try {
    await cliente.connect();

    // Garante uma regra ativa conhecida: dispara acima de 35.
    await chamar("PUT", `/api/alerts/config/${configId}`, {
      ...baseConfig,
      reference_value: 35,
      active: true,
    });
    // A segunda config (operador "<", referência 10) atrapalharia a contagem.
    if (configsCriadas[1]) {
      await chamar("DELETE", `/api/alerts/config/${configsCriadas[1]}`);
      configsCriadas.splice(1, 1);
    }

    const inserirLeitura = async (valor) => {
      const r = await cliente.query(
        `INSERT INTO readings (sensor_id, value, unix_time)
         VALUES ($1, $2, extract(epoch from now())::bigint) RETURNING id`,
        [SENSOR_ID, valor],
      );
      const id = Number(r.rows[0].id);
      leiturasInseridas.push(id);
      return id;
    };

    const contarAlertas = async () => {
      const r = await cliente.query(
        `SELECT count(*)::int AS total FROM triggered_alerts WHERE alert_config_id = $1`,
        [configId],
      );
      return r.rows[0].total;
    };

    // Guarda o checkpoint atual para restaurar no fim: sem isso, leituras de
    // outra pessoa ainda não processadas (id <= MAX) seriam puladas pelo motor.
    const { rows: atual } = await cliente.query(
      `SELECT value FROM processing_checkpoints WHERE key = 'rules_engine_last_reading_id'`,
    );
    checkpointOriginal = atual[0]?.value ?? null;

    // Põe o checkpoint logo antes das leituras deste teste, para o ciclo não
    // varrer a base inteira nem reavaliar dados de outra pessoa.
    const { rows: ultima } = await cliente.query(
      `SELECT COALESCE(MAX(id), 0)::bigint AS id FROM readings`,
    );
    await cliente.query(
      `INSERT INTO processing_checkpoints (key, value, updated_at)
       VALUES ('rules_engine_last_reading_id', $1, current_timestamp)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = current_timestamp`,
      [String(ultima[0].id)],
    );

    await inserirLeitura(20);
    const cicloAbaixo = await chamar("POST", "/internal/rules-engine/run");
    verificar(
      "ciclo processa a leitura",
      cicloAbaixo.json?.readings_processed >= 1,
      cicloAbaixo.json,
    );
    verificar(
      "leitura abaixo do limite não dispara alerta",
      cicloAbaixo.json?.alerts_triggered === 0,
      cicloAbaixo.json,
    );
    verificar(
      "last_reading_id vem como número",
      typeof cicloAbaixo.json?.last_reading_id === "number",
      cicloAbaixo.json?.last_reading_id,
    );

    const leituraAlta = await inserirLeitura(38.5);
    const cicloAcima = await chamar("POST", "/internal/rules-engine/run");
    verificar(
      "leitura acima do limite dispara alerta",
      cicloAcima.json?.alerts_triggered === 1,
      cicloAcima.json,
    );

    const totalDepois = await contarAlertas();
    verificar("o alerta foi gravado", totalDepois === 1, totalDepois);

    const pendentes = await chamar(
      "GET",
      "/api/alerts/triggered?acknowledged=false",
    );
    const meuAlerta = (pendentes.json?.data ?? []).find(
      (a) => a.alert_config_id === configId,
    );
    verificar(
      "o alerta aparece entre os pendentes",
      Boolean(meuAlerta),
      pendentes.json?.meta,
    );
    verificar(
      "id do alerta vem como número",
      typeof meuAlerta?.id === "number",
      meuAlerta?.id,
    );
    verificar(
      "reading_id vem como número",
      typeof meuAlerta?.reading_id === "number",
      meuAlerta?.reading_id,
    );
    verificar(
      "reading_id é o da leitura inserida",
      meuAlerta?.reading_id === leituraAlta,
      meuAlerta?.reading_id,
    );

    // Idempotência: reprocessar o mesmo lote não pode duplicar.
    await cliente.query(
      `UPDATE processing_checkpoints SET value = $1 WHERE key = 'rules_engine_last_reading_id'`,
      [String(ultima[0].id)],
    );
    const reprocessa = await chamar("POST", "/internal/rules-engine/run");
    verificar(
      "reprocessar o lote não dispara de novo",
      reprocessa.json?.alerts_triggered === 0,
      reprocessa.json,
    );
    verificar(
      "o total de alertas continua 1",
      (await contarAlertas()) === 1,
      await contarAlertas(),
    );

    if (meuAlerta?.id) {
      const reconhece = await chamar(
        "PUT",
        `/api/alerts/triggered/${meuAlerta.id}/acknowledge`,
        {
          acknowledged_by: 1,
        },
      );
      verificar(
        "reconhecer devolve 200",
        reconhece.status === 200,
        reconhece.status,
      );
      verificar(
        "acknowledged_at é preenchido",
        Boolean(reconhece.json?.acknowledged_at),
        reconhece.json,
      );

      const denovo = await chamar(
        "PUT",
        `/api/alerts/triggered/${meuAlerta.id}/acknowledge`,
        {
          acknowledged_by: 1,
        },
      );
      verificar(
        "reconhecer de novo devolve 409",
        denovo.status === 409,
        denovo.status,
      );
      verificar(
        "código é ALERT_ALREADY_ACKNOWLEDGED",
        denovo.json?.code === "ALERT_ALREADY_ACKNOWLEDGED",
        denovo.json?.code,
      );
    }

    const alertaInexistente = await chamar(
      "PUT",
      "/api/alerts/triggered/999999/acknowledge",
      { acknowledged_by: 1 },
    );
    verificar(
      "reconhecer alerta inexistente devolve 404",
      alertaInexistente.status === 404,
      alertaInexistente.status,
    );
  } catch (erro) {
    falhou++;
    console.log(`  FALHA motor de regras: ${erro.message}`);
    console.log(`         (use --sem-motor para pular esta parte)`);
  }
}

// --- limpeza ---------------------------------------------------------------
console.log("\nLimpeza");
if (cliente) {
  try {
    await cliente.query(
      `DELETE FROM triggered_alerts WHERE alert_config_id = ANY($1::int[])`,
      [configsCriadas],
    );
    await cliente.query(`DELETE FROM readings WHERE id = ANY($1::bigint[])`, [
      leiturasInseridas,
    ]);
    if (checkpointOriginal === null) {
      await cliente.query(
        `DELETE FROM processing_checkpoints WHERE key = 'rules_engine_last_reading_id'`,
      );
    } else if (checkpointOriginal !== undefined) {
      await cliente.query(
        `UPDATE processing_checkpoints SET value = $1, updated_at = current_timestamp
         WHERE key = 'rules_engine_last_reading_id'`,
        [checkpointOriginal],
      );
    }
    console.log("  ok   leituras, alertas e checkpoint do teste restaurados");
    passou++;
  } catch (erro) {
    console.log(`  FALHA ao limpar leituras e alertas: ${erro.message}`);
    falhou++;
  }
}

for (const id of configsCriadas) {
  const excluida = await chamar("DELETE", `/api/alerts/config/${id}`);
  verificar(
    `DELETE da configuração ${id} devolve 204`,
    excluida.status === 204,
    excluida.status,
  );
}

if (cliente) await cliente.end().catch(() => {});

// --- resultado -------------------------------------------------------------
console.log(`\n${passou} ok, ${falhou} falha(s).`);
if (falhou > 0) process.exit(1);
console.log("Tudo certo. Nenhum dado de teste ficou no banco.");
