import "@/config/zod.config.js";

import cookie from "@fastify/cookie";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { database } from "@/config/database.js";
import { handleError } from "@/errors/error-handler.js";
import type {
  AlertConfigRepository,
  TriggeredAlertRepository,
} from "@/modules/alerts/repositories/alert.repository.js";
import {
  PgAlertConfigRepository,
  PgTriggeredAlertRepository,
} from "@/modules/alerts/repositories/pg-alert.repository.js";
import { buildAlertRoutes } from "@/modules/alerts/routes/alerts.route.js";
import type { RulesEngineWorker } from "@/modules/rules-engine/services/rules-engine.worker.js";

type BuildAppOptions = {
  alertConfigRepository?: AlertConfigRepository;
  triggeredAlertRepository?: TriggeredAlertRepository;
  rulesEngineWorker?: RulesEngineWorker;
};

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(handleError);

  const alertConfigRepository =
    options.alertConfigRepository ?? new PgAlertConfigRepository(database);
  const triggeredAlertRepository =
    options.triggeredAlertRepository ??
    new PgTriggeredAlertRepository(database);

  app.register(cookie);

  app.get("/health", async () => ({
    status: "ok",
    rules_engine: options.rulesEngineWorker?.isRunning ?? false,
  }));

  // Rota de operação: força um ciclo sem esperar o próximo agendamento.
  app.post("/internal/rules-engine/run", async (_request, reply) => {
    if (!options.rulesEngineWorker) {
      return reply.status(503).send({
        statusCode: 503,
        code: "RULES_ENGINE_UNAVAILABLE",
        message: "Rules engine is not attached to this instance.",
      });
    }

    const result = await options.rulesEngineWorker.runOnce();

    if (result === null) {
      return reply.status(409).send({
        statusCode: 409,
        code: "RULES_ENGINE_BUSY",
        message: "A processing cycle is already running.",
      });
    }

    return reply.status(200).send(result);
  });

  app.register(
    buildAlertRoutes(alertConfigRepository, triggeredAlertRepository),
    {
      prefix: "/api/alerts",
    },
  );

  return app;
}
