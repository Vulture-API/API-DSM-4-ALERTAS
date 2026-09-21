import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("RulesEngineWorker", () => {
  let readings: InMemoryReadingRepository;
  let service: ProcessReadingsService;

  beforeEach(() => {
    readings = new InMemoryReadingRepository();
    service = new ProcessReadingsService(
      readings,
      new InMemoryCheckpointRepository(),
      new InMemoryAlertConfigRepository(),
      new InMemoryTriggeredAlertRepository(),
    );
  });

  it("should_report_not_running_before_start", () => {
    const worker = new RulesEngineWorker(service, { intervalMs: 1000 });

    expect(worker.isRunning).toBe(false);
  });

  it("should_report_running_after_start_and_stop_correctly", () => {
    const worker = new RulesEngineWorker(service, { intervalMs: 1000 });

    worker.start();
    expect(worker.isRunning).toBe(true);

    worker.stop();
    expect(worker.isRunning).toBe(false);
  });

  it("should_run_a_cycle_and_notify_the_callback", async () => {
    const onCycle = vi.fn();
    const worker = new RulesEngineWorker(service, {
      intervalMs: 1000,
      onCycle,
    });

    readings.add({ sensor_id: 1, value: 30 });

    const result = await worker.runOnce();

    expect(result?.readings_processed).toBe(1);
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it("should_report_the_error_and_return_null_when_a_cycle_fails", async () => {
    const onError = vi.fn();
    const failing = {
      execute: vi.fn().mockRejectedValue(new Error("db down")),
    } as unknown as ProcessReadingsService;

    const worker = new RulesEngineWorker(failing, {
      intervalMs: 1000,
      onError,
    });

    await expect(worker.runOnce()).resolves.toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("should_not_start_twice", () => {
    const worker = new RulesEngineWorker(service, { intervalMs: 1000 });

    worker.start();
    worker.start();

    expect(worker.isRunning).toBe(true);
    worker.stop();
  });
});
