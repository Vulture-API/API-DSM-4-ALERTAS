import { beforeEach, describe, expect, it } from "vitest";

import {
  InMemoryAlertConfigRepository,
  InMemoryTriggeredAlertRepository,
} from "@/modules/alerts/repositories/in-memory-alert.repository.js";
import type { ComparisonOperator } from "@/modules/alerts/types/alert.type.js";
import {
  InMemoryCheckpointRepository,
  InMemoryReadingRepository,
} from "@/modules/rules-engine/repositories/in-memory-reading.repository.js";
import { ProcessReadingsService } from "@/modules/rules-engine/services/process-readings.service.js";

describe("ProcessReadingsService", () => {
  let readings: InMemoryReadingRepository;
  let checkpoints: InMemoryCheckpointRepository;
  let configs: InMemoryAlertConfigRepository;
  let triggered: InMemoryTriggeredAlertRepository;
  let service: ProcessReadingsService;

  beforeEach(() => {
    readings = new InMemoryReadingRepository();
    checkpoints = new InMemoryCheckpointRepository();
    configs = new InMemoryAlertConfigRepository();
    triggered = new InMemoryTriggeredAlertRepository();
    service = new ProcessReadingsService(
      readings,
      checkpoints,
      configs,
      triggered,
    );
  });

  async function addConfig(
    overrides: Partial<{
      sensor_id: number;
      reference_value: number;
      comparison_operator: ComparisonOperator;
      active: boolean;
    }> = {},
  ) {
    return configs.create({
      manager_user_id: null,
      sensor_id: 1,
      reference_value: 25,
      comparison_operator: ">",
      message: "Temperatura crítica",
      active: true,
      ...overrides,
    });
  }

  it("should_return_zero_when_there_are_no_readings", async () => {
    const result = await service.execute();

    expect(result).toEqual({
      readings_processed: 0,
      alerts_triggered: 0,
      last_reading_id: 0,
    });
  });

  it("should_trigger_alert_when_reading_violates_active_rule", async () => {
    await addConfig();
    readings.add({ sensor_id: 1, value: 30 });

    const result = await service.execute();

    expect(result.readings_processed).toBe(1);
    expect(result.alerts_triggered).toBe(1);
    expect(triggered.alerts[0]).toMatchObject({
      alert_config_id: 1,
      reading_id: 1,
      acknowledged_at: null,
    });
  });

  it("should_not_trigger_when_reading_is_within_limits", async () => {
    await addConfig();
    readings.add({ sensor_id: 1, value: 20 });

    const result = await service.execute();

    expect(result.readings_processed).toBe(1);
    expect(result.alerts_triggered).toBe(0);
    expect(triggered.alerts).toHaveLength(0);
  });

  it("should_trigger_one_alert_per_matching_rule", async () => {
    await addConfig({ reference_value: 25 });
    await addConfig({ reference_value: 28 });
    readings.add({ sensor_id: 1, value: 30 });

    const result = await service.execute();

    expect(result.alerts_triggered).toBe(2);
  });

  it("should_ignore_inactive_rules", async () => {
    await addConfig({ active: false });
    readings.add({ sensor_id: 1, value: 30 });

    const result = await service.execute();

    expect(result.alerts_triggered).toBe(0);
  });

  it("should_ignore_rules_of_other_sensors", async () => {
    await addConfig({ sensor_id: 2 });
    readings.add({ sensor_id: 1, value: 30 });

    const result = await service.execute();

    expect(result.alerts_triggered).toBe(0);
  });

  it("should_advance_checkpoint_after_processing", async () => {
    await addConfig();
    readings.add({ sensor_id: 1, value: 30 });
    readings.add({ sensor_id: 1, value: 31 });

    await service.execute();

    await expect(checkpoints.getLastProcessedReadingId()).resolves.toBe(2);
  });

  it("should_not_reprocess_readings_already_covered_by_checkpoint", async () => {
    await addConfig();
    readings.add({ sensor_id: 1, value: 30 });

    await service.execute();
    const second = await service.execute();

    expect(second.readings_processed).toBe(0);
    expect(triggered.alerts).toHaveLength(1);
  });

  it("should_be_idempotent_when_the_same_batch_is_reprocessed", async () => {
    await addConfig();
    readings.add({ sensor_id: 1, value: 30 });

    await service.execute();
    await checkpoints.setLastProcessedReadingId(0);
    const rerun = await service.execute();

    expect(rerun.readings_processed).toBe(1);
    expect(rerun.alerts_triggered).toBe(0);
    expect(triggered.alerts).toHaveLength(1);
  });

  it("should_respect_batch_size_limit", async () => {
    await addConfig();

    for (let index = 0; index < 5; index++) {
      readings.add({ sensor_id: 1, value: 30 });
    }

    const limited = new ProcessReadingsService(
      readings,
      checkpoints,
      configs,
      triggered,
      { batchSize: 2 },
    );

    const result = await limited.execute();

    expect(result.readings_processed).toBe(2);
    expect(result.last_reading_id).toBe(2);
  });

  it("should_skip_inconsistent_readings", async () => {
    await addConfig();
    readings.add({ sensor_id: 1, value: 30, data_consistent: false });

    const result = await service.execute();

    expect(result.readings_processed).toBe(1);
    expect(result.alerts_triggered).toBe(0);
  });
});
