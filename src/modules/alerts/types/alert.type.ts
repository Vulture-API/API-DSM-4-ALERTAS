export const COMPARISON_OPERATORS = [">", "<", ">=", "<=", "=", "!="] as const;

export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

export type AlertConfig = {
  id: number;
  manager_user_id: number | null;
  sensor_id: number;
  reference_value: number;
  comparison_operator: ComparisonOperator;
  message: string | null;
  active: boolean;
  created_at: Date;
};

export type CreateAlertConfigData = {
  manager_user_id: number | null;
  sensor_id: number;
  reference_value: number;
  comparison_operator: ComparisonOperator;
  message: string | null;
  active: boolean;
};

export type UpdateAlertConfigData = CreateAlertConfigData;

export type ListAlertConfigsFilters = {
  page: number;
  limit: number;
  sensor_id?: number | undefined;
  manager_user_id?: number | undefined;
};

export type TriggeredAlert = {
  id: number;
  alert_config_id: number;
  reading_id: number;
  acknowledged_by: number | null;
  triggered_at: Date;
  acknowledged_at: Date | null;
  /** Valor da leitura que disparou o alerta (null se a leitura já expirou). */
  reading_value: number | null;
  reading_unix_time: number | null;
};

export type ListTriggeredAlertsFilters = {
  page: number;
  limit: number;
  acknowledged?: boolean | undefined;
};

export type PaginatedResult<T> = {
  data: T[];
  total_records: number;
};
