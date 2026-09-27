import type {
  AlertConfig,
  ComparisonOperator,
} from "@/modules/alerts/types/alert.type.js";
import type { Reading } from "@/modules/rules-engine/types/reading.type.js";

const COMPARATORS: Record<
  ComparisonOperator,
  (value: number, reference: number) => boolean
> = {
  ">": (value, reference) => value > reference,
  "<": (value, reference) => value < reference,
  ">=": (value, reference) => value >= reference,
  "<=": (value, reference) => value <= reference,
  "=": (value, reference) => value === reference,
  "!=": (value, reference) => value !== reference,
};

export class RuleEvaluator {
  static violates(reading: Reading, config: AlertConfig): boolean {
    if (!config.active) return false;

    if (config.sensor_id !== reading.sensor_id) return false;

    // Dado corrompido do datalogger não pode virar alarme falso.
    if (!reading.data_consistent) return false;

    return COMPARATORS[config.comparison_operator](
      reading.value,
      config.reference_value,
    );
  }
}
