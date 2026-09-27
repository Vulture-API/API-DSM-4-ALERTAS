import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import {
  InMemoryAlertConfigRepository,
  InMemoryTriggeredAlertRepository,
} from "@/modules/alerts/repositories/in-memory-alert.repository.js";
import type { ProcessReadingsService } from "@/modules/rules-engine/services/process-readings.service.js";
import { RulesEngineWorker } from "@/modules/rules-engine/services/rules-engine.worker.js";

describe("alert routes", () => {
  let app: FastifyInstance;
  let configs: InMemoryAlertConfigRepository;
  let triggered: InMemoryTriggeredAlertRepository;

  const validPayload = {
    manager_user_id: 1,
    sensor_id: 1,
    reference_value: 35.5,
    comparison_operator: ">",
    message: "Temperatura acima do limite",
    active: true,
  };

  beforeEach(async () => {
    configs = new InMemoryAlertConfigRepository();
    triggered = new InMemoryTriggeredAlertRepository();
    app = buildApp({
      alertConfigRepository: configs,
      triggeredAlertRepository: triggered,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createConfig(overrides: Record<string, unknown> = {}) {
    return app.inject({
      method: "POST",
      url: "/api/alerts/config",
      payload: { ...validPayload, ...overrides },
    });
  }

  it("should_create_alert_config_when_payload_is_valid", async () => {
    const response = await createConfig();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 1,
      sensor_id: 1,
      reference_value: 35.5,
      comparison_operator: ">",
      active: true,
    });
  });

  it("should_default_optional_fields_when_omitted", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/alerts/config",
      payload: {
        sensor_id: 1,
        reference_value: 10,
        comparison_operator: "<",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      manager_user_id: null,
      message: null,
      active: true,
    });
  });

  it("should_parse_active_false_sent_as_string_as_false", async () => {
    const response = await createConfig({ active: "false" });

    expect(response.statusCode).toBe(201);
    expect(response.json().active).toBe(false);
  });

  it("should_parse_active_true_sent_as_string_as_true", async () => {
    const response = await createConfig({ active: "true" });

    expect(response.statusCode).toBe(201);
    expect(response.json().active).toBe(true);
  });

  it("should_reject_active_with_a_non_boolean_string", async () => {
    const response = await createConfig({ active: "no" });

    expect(response.statusCode).toBe(400);
  });

  it("should_return_validation_error_when_operator_is_invalid", async () => {
    const response = await createConfig({ comparison_operator: "<>" });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
  });

  it("should_return_validation_error_when_sensor_id_is_missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/alerts/config",
      payload: { reference_value: 10, comparison_operator: ">" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should_return_validation_error_when_message_exceeds_200_chars", async () => {
    const response = await createConfig({ message: "a".repeat(201) });

    expect(response.statusCode).toBe(400);
  });

  it("should_return_conflict_when_sensor_does_not_exist", async () => {
    const response = await createConfig({ sensor_id: 999 });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SENSOR_NOT_FOUND");
  });

  it("should_list_alert_configs_with_pagination_meta", async () => {
    await createConfig();
    await createConfig({ sensor_id: 2 });

    const response = await app.inject({
      method: "GET",
      url: "/api/alerts/config?page=1&limit=1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().meta).toEqual({
      total_records: 2,
      total_pages: 2,
      current_page: 1,
    });
  });

  it("should_filter_configs_by_sensor_id", async () => {
    await createConfig();
    await createConfig({ sensor_id: 2 });

    const response = await app.inject({
      method: "GET",
      url: "/api/alerts/config?sensor_id=2",
    });

    expect(response.json().meta.total_records).toBe(1);
  });

  it("should_get_alert_config_by_id", async () => {
    await createConfig();

    const response = await app.inject({
      method: "GET",
      url: "/api/alerts/config/1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(1);
  });

  it("should_return_not_found_when_config_does_not_exist", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/alerts/config/999",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("ALERT_CONFIG_NOT_FOUND");
  });

  it("should_update_alert_config", async () => {
    await createConfig();

    const response = await app.inject({
      method: "PUT",
      url: "/api/alerts/config/1",
      payload: { ...validPayload, reference_value: 40, active: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      reference_value: 40,
      active: false,
    });
  });

  it("should_return_not_found_when_updating_unknown_config", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/alerts/config/999",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(404);
  });

  it("should_return_conflict_when_updating_to_unknown_sensor", async () => {
    await createConfig();

    const response = await app.inject({
      method: "PUT",
      url: "/api/alerts/config/1",
      payload: { ...validPayload, sensor_id: 999 },
    });

    expect(response.statusCode).toBe(409);
  });

  it("should_delete_alert_config", async () => {
    await createConfig();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/alerts/config/1",
    });

    expect(response.statusCode).toBe(204);
    expect(configs.configs).toHaveLength(0);
  });

  it("should_return_not_found_when_deleting_unknown_config", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/alerts/config/999",
    });

    expect(response.statusCode).toBe(404);
  });

  it("should_list_triggered_alerts_with_pagination_meta", async () => {
    await triggered.create({ alert_config_id: 1, reading_id: 1 });
    await triggered.create({ alert_config_id: 2, reading_id: 2 });

    const response = await app.inject({
      method: "GET",
      url: "/api/alerts/triggered",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().meta.total_records).toBe(2);
  });

  it("should_filter_triggered_alerts_by_acknowledged_flag", async () => {
    await triggered.create({ alert_config_id: 1, reading_id: 1 });
    const second = (await triggered.create({
      alert_config_id: 2,
      reading_id: 2,
    }))!;
    await triggered.acknowledge(second.id, 1);

    const pending = await app.inject({
      method: "GET",
      url: "/api/alerts/triggered?acknowledged=false",
    });
    const done = await app.inject({
      method: "GET",
      url: "/api/alerts/triggered?acknowledged=true",
    });

    expect(pending.json().meta.total_records).toBe(1);
    expect(done.json().meta.total_records).toBe(1);
  });

  it("should_acknowledge_a_triggered_alert", async () => {
    await triggered.create({ alert_config_id: 1, reading_id: 1 });

    const response = await app.inject({
      method: "PUT",
      url: "/api/alerts/triggered/1/acknowledge",
      payload: { acknowledged_by: 7 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().acknowledged_by).toBe(7);
    expect(response.json().acknowledged_at).not.toBeNull();
  });

  it("should_return_conflict_when_alert_is_already_acknowledged", async () => {
    await triggered.create({ alert_config_id: 1, reading_id: 1 });
    await triggered.acknowledge(1, 7);

    const response = await app.inject({
      method: "PUT",
      url: "/api/alerts/triggered/1/acknowledge",
      payload: { acknowledged_by: 8 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ALERT_ALREADY_ACKNOWLEDGED");
  });

  it("should_let_only_one_of_two_concurrent_acknowledgements_win", async () => {
    await triggered.create({ alert_config_id: 1, reading_id: 1 });

    const [first, second] = await Promise.all([
      app.inject({
        method: "PUT",
        url: "/api/alerts/triggered/1/acknowledge",
        payload: { acknowledged_by: 7 },
      }),
      app.inject({
        method: "PUT",
        url: "/api/alerts/triggered/1/acknowledge",
        payload: { acknowledged_by: 8 },
      }),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    const winner = first.statusCode === 200 ? 7 : 8;
    expect((await triggered.findById(1))?.acknowledged_by).toBe(winner);
  });

  it("should_return_not_found_when_acknowledging_unknown_alert", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/alerts/triggered/999/acknowledge",
      payload: { acknowledged_by: 1 },
    });

    expect(response.statusCode).toBe(404);
  });

  it("should_expose_health_endpoint", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", rules_engine: false });
  });

  it("should_return_internal_error_and_not_busy_when_a_manual_cycle_fails", async () => {
    const failingApp = buildApp({
      alertConfigRepository: configs,
      triggeredAlertRepository: triggered,
      rulesEngineWorker: new RulesEngineWorker(
        {
          execute: () => Promise.reject(new Error("db down")),
        } as unknown as ProcessReadingsService,
        { intervalMs: 1000 },
      ),
    });
    await failingApp.ready();

    const response = await failingApp.inject({
      method: "POST",
      url: "/internal/rules-engine/run",
    });
    await failingApp.close();

    expect(response.statusCode).toBe(500);
    expect(response.json().code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("should_return_service_unavailable_when_rules_engine_is_not_attached", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/rules-engine/run",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("RULES_ENGINE_UNAVAILABLE");
  });
});
