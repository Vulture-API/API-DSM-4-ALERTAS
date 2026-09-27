import { describe, expect, it } from "vitest";

import type {
  AlertConfig,
  ComparisonOperator,
} from "@/modules/alerts/types/alert.type.js";
import { RuleEvaluator } from "@/modules/rules-engine/services/rule-evaluator.service.js";
import type { Reading } from "@/modules/rules-engine/types/reading.type.js";

function buildReading(overrides: Partial<Reading> = {}): Reading {
  return {
    id: 1,
    sensor_id: 1,
    value: 30,
    unix_time: 1_767_225_600,
    data_consistent: true,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildConfig(overrides: Partial<AlertConfig> = {}): AlertConfig {
  return {
    id: 1,
    manager_user_id: null,
    sensor_id: 1,
    reference_value: 25,
    comparison_operator: ">",
    message: "Temperatura crítica",
    active: true,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("RuleEvaluator", () => {
  const cases: Array<[ComparisonOperator, number, number, boolean]> = [
    [">", 30, 25, true],
    [">", 25, 25, false],
    ["<", 20, 25, true],
    ["<", 25, 25, false],
    [">=", 25, 25, true],
    [">=", 24, 25, false],
    ["<=", 25, 25, true],
    ["<=", 26, 25, false],
    ["=", 25, 25, true],
    ["=", 25.1, 25, false],
    ["!=", 26, 25, true],
    ["!=", 25, 25, false],
  ];

  it.each(cases)(
    "should_return_%s_result_when_value_%s_compared_to_%s",
    (operator, value, reference, expected) => {
      const result = RuleEvaluator.violates(
        buildReading({ value }),
        buildConfig({
          comparison_operator: operator,
          reference_value: reference,
        }),
      );

      expect(result).toBe(expected);
    },
  );

  it("should_not_trigger_when_config_is_inactive", () => {
    expect(
      RuleEvaluator.violates(buildReading(), buildConfig({ active: false })),
    ).toBe(false);
  });

  it("should_not_trigger_when_sensor_ids_differ", () => {
    expect(
      RuleEvaluator.violates(buildReading(), buildConfig({ sensor_id: 99 })),
    ).toBe(false);
  });

  it("should_not_trigger_when_reading_is_inconsistent", () => {
    expect(
      RuleEvaluator.violates(
        buildReading({ data_consistent: false }),
        buildConfig(),
      ),
    ).toBe(false);
  });

  it("should_trigger_on_exact_boundary_when_operator_is_inclusive", () => {
    expect(
      RuleEvaluator.violates(
        buildReading({ value: 25 }),
        buildConfig({ comparison_operator: ">=", reference_value: 25 }),
      ),
    ).toBe(true);
  });

  it("should_handle_negative_reference_values", () => {
    expect(
      RuleEvaluator.violates(
        buildReading({ value: -5 }),
        buildConfig({ comparison_operator: "<", reference_value: 0 }),
      ),
    ).toBe(true);
  });
});
