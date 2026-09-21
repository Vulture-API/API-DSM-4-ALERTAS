import { buildApp } from "@/app.js";
import { database } from "@/config/database.js";
import { env } from "@/config/environment.js";
import {
  PgAlertConfigRepository,
  PgTriggeredAlertRepository,
} from "@/modules/alerts/repositories/pg-alert.repository.js";
import {
  PgCheckpointRepository,
  PgReadingRepository,
} from "@/modules/rules-engine/repositories/pg-reading.repository.js";
import { ProcessReadingsService } from "@/modules/rules-engine/services/process-readings.service.js";
import { RulesEngineWorker } from "@/modules/rules-engine/services/rules-engine.worker.js";

const alertConfigRepository = new PgAlertConfigRepository(database);
const triggeredAlertRepository = new PgTriggeredAlertRepository(database);

const processReadingsService = new ProcessReadingsService(
  new PgReadingRepository(database),
  new PgCheckpointRepository(database),
  alertConfigRepository,
  triggeredAlertRepository,
  { batchSize: env.RULES_ENGINE_BATCH_SIZE },
);

const rulesEngineWorker = new RulesEngineWorker(processReadingsService, {
  intervalMs: env.RULES_ENGINE_INTERVAL_MS,
  onCycle: (result) => {
    if (result.readings_processed === 0) return;

    console.log(
      `[rules-engine] ${result.readings_processed} leitura(s) processada(s), ` +
        `${result.alerts_triggered} alerta(s) disparado(s), ` +
        `checkpoint em ${result.last_reading_id}`,
    );
  },
  onError: (error) => {
    console.error("[rules-engine] Falha no ciclo de processamento:", error);
  },
});

const app = buildApp({
  alertConfigRepository,
  triggeredAlertRepository,
  rulesEngineWorker,
});

let isShuttingDown = false;

async function shutdownApp(signal: NodeJS.Signals) {
  if (isShuttingDown) return;

  isShuttingDown = true;
  console.log(`Received ${signal}. Shutting down application...`);

  try {
    await rulesEngineWorker.stop();

    await app.close();
    await database.end();

    console.log("Application shut down.");
  } catch (error) {
    console.error("Error while shutting down application:", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  void shutdownApp("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdownApp("SIGTERM");
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });

if (env.RULES_ENGINE_ENABLED) {
  rulesEngineWorker.start();
  console.log(
    `Rules engine ativo (intervalo: ${env.RULES_ENGINE_INTERVAL_MS}ms, lote: ${env.RULES_ENGINE_BATCH_SIZE})`,
  );
}

console.log("Server is running!");
console.log(`http://localhost:${env.PORT}`);
