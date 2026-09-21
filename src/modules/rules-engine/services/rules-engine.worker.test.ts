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

    void worker.stop();
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

  it("should_report_the_error_and_rethrow_when_a_cycle_fails", async () => {
    const onError = vi.fn();
    const failing = {
      execute: vi.fn().mockRejectedValue(new Error("db down")),
    } as unknown as ProcessReadingsService;

    const worker = new RulesEngineWorker(failing, {
      intervalMs: 1000,
      onError,
    });

    await expect(worker.runOnce()).rejects.toThrow("db down");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("should_not_start_twice", () => {
    const worker = new RulesEngineWorker(service, { intervalMs: 1000 });

    worker.start();
    worker.start();

    expect(worker.isRunning).toBe(true);
    void worker.stop();
  });

  it("should_return_null_only_when_a_cycle_is_already_running", async () => {
    let release!: () => void;
    const slow = {
      execute: vi.fn(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                readings_processed: 0,
                alerts_triggered: 0,
                last_reading_id: 0,
              });
          }),
      ),
    } as unknown as ProcessReadingsService;
    const worker = new RulesEngineWorker(slow, { intervalMs: 1000 });

    const first = worker.runOnce();
    await expect(worker.runOnce()).resolves.toBeNull();

    release();
    await expect(first).resolves.toMatchObject({ readings_processed: 0 });
  });

  it("should_wait_for_the_in_flight_cycle_when_stopping", async () => {
    let release!: () => void;
    let finished = false;
    const slow = {
      execute: vi.fn(
        () =>
          new Promise((resolve) => {
            release = () => {
              finished = true;
              resolve({
                readings_processed: 1,
                alerts_triggered: 0,
                last_reading_id: 1,
              });
            };
          }),
      ),
    } as unknown as ProcessReadingsService;
    const worker = new RulesEngineWorker(slow, { intervalMs: 1000 });

    void worker.runOnce();
    const stopping = worker.stop();
    setTimeout(() => release(), 20);
    await stopping;

    expect(finished).toBe(true);
  });

  it("should_keep_scheduling_after_a_failed_cycle", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue({
        readings_processed: 0,
        alerts_triggered: 0,
        last_reading_id: 0,
      });
    const onError = vi.fn();
    const worker = new RulesEngineWorker(
      { execute } as unknown as ProcessReadingsService,
      { intervalMs: 10, onError },
    );

    worker.start();
    await vi.waitFor(() =>
      expect(execute.mock.calls.length).toBeGreaterThan(1),
    );
    await worker.stop();

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
