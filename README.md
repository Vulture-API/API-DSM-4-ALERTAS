# API-DSM-4-ALERTAS

Microsserviço de **alertas** da plataforma AgroClima 360 (Equipe Vulture — 4º DSM).

Duas responsabilidades:

1. **CRUD de configurações de alerta** e consulta dos alertas disparados (SCRUM-374).
2. **Motor de processamento de regras** rodando em background, que cruza as leituras dos sensores com os parâmetros críticos e registra os alertas (SCRUM-373).

| Task Jira | Entrega                          |
| --------- | -------------------------------- |
| SCRUM-373 | Motor de processamento de regras |
| SCRUM-374 | Endpoints CRUD de alertas        |

## Stack

Node.js 24 · TypeScript · Fastify 5 · Zod 4 · PostgreSQL (`pg`) · Vitest · ESLint + Prettier

## Como rodar

```bash
cp .env.example .env     # preencha a DATABASE_URL com a URL do Neon
npm ci
npm run dev              # http://localhost:3002
```

O banco é o **Neon** (PostgreSQL gerenciado). As URLs estão na página "Banco de dados" do Confluence. O schema é criado pelos scripts em `API-DSM-4-BANCO/setup/`.

O motor de regras vem **desligado** por padrão (`RULES_ENGINE_ENABLED="false"`). Ligue só quando for testá-lo, e avise o time: o banco de `development` é compartilhado, e duas pessoas rodando o motor ao mesmo tempo disputam o mesmo checkpoint.

## Variáveis de ambiente

| Variável                   | Padrão  | Descrição                                      |
| -------------------------- | ------- | ---------------------------------------------- |
| `PORT`                     | —       | Porta HTTP                                     |
| `DATABASE_URL`             | —       | String de conexão do Postgres                  |
| `RULES_ENGINE_ENABLED`     | `false` | Liga/desliga o motor de regras nesta instância |
| `RULES_ENGINE_INTERVAL_MS` | `15000` | Intervalo entre ciclos de processamento        |
| `RULES_ENGINE_BATCH_SIZE`  | `500`   | Leituras avaliadas por ciclo                   |

## Endpoints

Prefixo: `/api/alerts`

| Método   | Rota                                    | Descrição                                                        | Respostas                  |
| -------- | --------------------------------------- | ---------------------------------------------------------------- | -------------------------- |
| `POST`   | `/api/alerts/config`                    | Cria configuração de alerta                                      | `201`, `400`, `409`        |
| `GET`    | `/api/alerts/config`                    | Lista paginada (`page`, `limit`, `sensor_id`, `manager_user_id`) | `200`                      |
| `GET`    | `/api/alerts/config/:id`                | Busca por ID                                                     | `200`, `404`               |
| `PUT`    | `/api/alerts/config/:id`                | Atualiza configuração                                            | `200`, `400`, `404`, `409` |
| `DELETE` | `/api/alerts/config/:id`                | Exclui configuração                                              | `204`, `404`               |
| `GET`    | `/api/alerts/triggered`                 | Lista alertas disparados (`acknowledged=true\|false`)            | `200`                      |
| `PUT`    | `/api/alerts/triggered/:id/acknowledge` | Reconhece um alerta                                              | `200`, `404`, `409`        |
| `GET`    | `/health`                               | Healthcheck + estado do motor                                    | `200`                      |
| `POST`   | `/internal/rules-engine/run`            | Dispara um ciclo sob demanda                                     | `200`, `409`, `503`        |

### Corpo da configuração de alerta

```json
{
  "manager_user_id": 1,
  "sensor_id": 1,
  "reference_value": 35.5,
  "comparison_operator": ">",
  "message": "Temperatura acima do limite",
  "active": true
}
```

Obrigatórios: `sensor_id`, `reference_value`, `comparison_operator`.
Operadores aceitos: `>`, `<`, `>=`, `<=`, `=`, `!=`.
`sensor_id` precisa existir em `sensors`, senão `409 SENSOR_NOT_FOUND`.

### Erros

| Código                       | HTTP |
| ---------------------------- | ---- |
| `VALIDATION_ERROR`           | 400  |
| `ALERT_CONFIG_NOT_FOUND`     | 404  |
| `TRIGGERED_ALERT_NOT_FOUND`  | 404  |
| `SENSOR_NOT_FOUND`           | 409  |
| `ALERT_ALREADY_ACKNOWLEDGED` | 409  |
| `RULES_ENGINE_BUSY`          | 409  |
| `RULES_ENGINE_UNAVAILABLE`   | 503  |
| `INTERNAL_SERVER_ERROR`      | 500  |

## Motor de regras (SCRUM-373)

Ciclo executado a cada `RULES_ENGINE_INTERVAL_MS`:

```
checkpoint (último reading_id avaliado)
      ↓
busca lote de leituras novas (LIMIT = batch size)
      ↓
para cada leitura → regras ativas do seu sensor
      ↓
RuleEvaluator.violates(leitura, regra)?
      ↓ sim
grava triggered_alert (se ainda não existir)
      ↓
avança o checkpoint
```

Decisões de projeto:

- **Checkpoint em tabela** (`processing_checkpoints`) em vez de memória: o serviço reinicia sem reprocessar a base inteira nem perder leituras.
- **O checkpoint só avança no fim do lote.** Se o processo cair no meio, o ciclo seguinte reprocessa o mesmo lote — e a checagem de duplicidade (mais o índice único `uq_triggered_alerts_reading_config`) garante que nenhum alerta é gravado duas vezes.
- **`setTimeout` reagendado, não `setInterval`**: um ciclo lento nunca se sobrepõe ao próximo.
- **Leituras com `data_consistent = false` são descartadas**, para não gerar alarme falso a partir de dado corrompido do datalogger.
- **Cache de regras por sensor dentro do lote**, evitando uma consulta por leitura.
- **`RuleEvaluator` é lógica pura**, sem I/O — testado isoladamente com todos os operadores e suas bordas.

### Escalando horizontalmente

Com mais de uma réplica da API, rode apenas uma com `RULES_ENGINE_ENABLED="true"` — caso contrário as réplicas competem pelo mesmo checkpoint. Para múltiplos workers de verdade, o passo seguinte é trocar a leitura do lote por `SELECT ... FOR UPDATE SKIP LOCKED`.

## Estrutura

```
src/
  app.ts                          # composição do Fastify
  index.ts                        # bootstrap: API + worker + graceful shutdown
  modules/alerts/                 # SCRUM-374 (CRUD)
  modules/rules-engine/           # SCRUM-373 (motor)
    services/rule-evaluator.service.ts     # lógica pura de comparação
    services/process-readings.service.ts   # um ciclo de processamento
    services/rules-engine.worker.ts        # agendamento em background
```

## Testes

```bash
npm run test:coverage
```

Nomenclatura `should_X_when_Y`, estrutura AAA, dublês só em fronteiras de I/O — conforme o _Guia Prático de Testes Unitários_ do time. Gate de cobertura em 80%.

### Sensor de teste

O smoke test e a coleção do Postman precisam de um sensor, e o seed não cria nenhum. Rode uma vez no SQL Editor do Neon:

```sql
INSERT INTO stations (property_id, mac_address, name)
SELECT (SELECT MIN(id) FROM properties), 'AA:BB:CC:DD:EE:F0', 'Estacao de teste'
WHERE NOT EXISTS (SELECT 1 FROM stations WHERE mac_address = 'AA:BB:CC:DD:EE:F0');

INSERT INTO sensors (station_id, sensor_type_id, local_identifier)
SELECT (SELECT id FROM stations WHERE mac_address = 'AA:BB:CC:DD:EE:F0'),
       (SELECT id FROM sensor_types WHERE name = 'Temperatura'), 'TESTE-TEMP-01'
WHERE NOT EXISTS (SELECT 1 FROM sensors WHERE local_identifier = 'TESTE-TEMP-01');

SELECT id AS sensor_id FROM sensors WHERE local_identifier = 'TESTE-TEMP-01';
```

Use o id devolvido em `npm run smoke -- --sensor-id <id>` e na variável `sensorId` do Postman.

## Pendências / dependências de outros membros

- **Autenticação**: o contrato diz que o `acknowledged_by` sai do JWT. Enquanto o serviço de auth não existe, a rota `/acknowledge` recebe `acknowledged_by` no corpo. Quando o middleware de JWT estiver pronto, trocar por `request.user.id` e remover o campo do schema.
- **Notificação ao usuário**: o motor grava o alerta no banco; o envio (e-mail/push) ainda não tem task nesta sprint.
- **Tabelas compartilhadas**: `sensors` e `readings` pertencem a outros serviços. O schema completo vive em `API-DSM-4-BANCO/setup/schema-neon.sql`.
