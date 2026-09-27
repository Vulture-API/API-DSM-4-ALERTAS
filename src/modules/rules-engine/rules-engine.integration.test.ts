import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import {
  InMemoryAlertConfigRepository,
  InMemoryTriggeredAlertRepository,
} from "@/modules/alerts/repositories/in-memory-alert.repository.js";
import {
  InMemoryCheckpointRepository,
  InMemoryReadingRepository,
} from "@/modules/rules-engine/repositories/in-memory-reading.repository.js";
import { ProcessReadingsService } from "@/modules/rules-engine/services/process-readings.service.js";
import { RulesEngineWorker } from "@/modules/rules-engine/services/rules-engine.worker.js";

describe("rules engine end to end", () => {
  let app: FastifyInstance;
  let readings: InMemoryReadingRepository;
  let configs: InMemoryAlertConfigRepository;
  let triggered: InMemoryTriggeredAlertRepository;
  let worker: RulesEngineWorker;

  beforeEach(async () => {
    readings = new InMemoryReadingRepository();
    configs = new InMemoryAlertConfigRepository();
    triggered = new InMemoryTriggeredAlertRepository();

    worker = new RulesEngineWorker(
      new ProcessReadingsService(
        readings,
        new InMemoryCheckpointRepository(),
        configs,
        triggered,
      ),
      { intervalMs: 50 },
    );

    app = buildApp({
      alertConfigRepository: configs,
      triggeredAlertRepository: triggered,
      rulesEngineWorker: worker,
    });
    await app.ready();
  });

  afterEach(async () => {
    await worker.stop();
    await app.close();
  });

  it("should_report_the_engine_state_on_health", async () => {
    const before = await app.inject({ method: "GET", url: "/health" });
    expect(before.json().rules_engine).toBe(false);

    worker.start();

    const after = await app.inject({ method: "GET", url: "/health" });
    expect(after.json().rules_engine).toBe(true);
  });

  it("should_create_a_triggered_alert_from_a_config_registered_via_api", async () => {
    await app.inject({
      method: "POST",
      url: "/api/alerts/config",
      payload: {
        sensor_id: 1,
        reference_value: 35,
        comparison_operator: ">",
        message: "Temperatura crítica",
      },
    });

    readings.add({ sensor_id: 1, value: 38.2 });

    const run = await app.inject({
      method: "POST",
      url: "/internal/rules-engine/run",
    });

    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({
      readings_processed: 1,
      alerts_triggered: 1,
      last_reading_id: 1,
    });

    const listed = await app.inject({
      method: "GET",
      url: "/api/alerts/triggered?acknowledged=false",
    });

    expect(listed.json().meta.total_records).toBe(1);
    expect(listed.json().data[0]).toMatchObject({
      alert_config_id: 1,
      reading_id: 1,
    });
  });

  it("should_not_trigger_after_the_config_is_deactivated", async () => {
    await app.inject({
      method: "POST",
      url: "/api/alerts/config",
      payload: {
        sensor_id: 1,
        reference_value: 35,
        comparison_operator: ">",
        active: false,
      },
    });

    readings.add({ sensor_id: 1, value: 40 });

    const run = await app.inject({
      method: "POST",
      url: "/internal/rules-engine/run",
    });

    expect(run.json().alerts_triggered).toBe(0);
  });

  it("should_return_zero_when_there_is_nothing_new_to_process", async () => {
    const run = await app.inject({
      method: "POST",
      url: "/internal/rules-engine/run",
    });

    expect(run.statusCode).toBe(200);
    expect(run.json().readings_processed).toBe(0);
  });

  it("should_process_automatically_after_start", async () => {
    await configs.create({
      manager_user_id: null,
      sensor_id: 1,
      reference_value: 35,
      comparison_operator: ">",
      message: null,
      active: true,
    });

    readings.add({ sensor_id: 1, value: 40 });

    worker.start();

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(triggered.alerts.length).toBeGreaterThanOrEqual(1);
  });
});
