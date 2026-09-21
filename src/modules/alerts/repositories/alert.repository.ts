import type {
  AlertConfig,
  CreateAlertConfigData,
  ListAlertConfigsFilters,
  ListTriggeredAlertsFilters,
  PaginatedResult,
  TriggeredAlert,
  UpdateAlertConfigData,
} from "@/modules/alerts/types/alert.type.js";

export interface AlertConfigRepository {
  create(data: CreateAlertConfigData): Promise<AlertConfig>;
  findMany(
    filters: ListAlertConfigsFilters,
  ): Promise<PaginatedResult<AlertConfig>>;
  findById(id: number): Promise<AlertConfig | null>;
  findActiveBySensorId(sensorId: number): Promise<AlertConfig[]>;
  update(id: number, data: UpdateAlertConfigData): Promise<AlertConfig | null>;
  delete(id: number): Promise<boolean>;
  sensorExists(sensorId: number): Promise<boolean>;
}

export interface TriggeredAlertRepository {
  create(data: {
    alert_config_id: number;
    reading_id: number;
  }): Promise<TriggeredAlert>;
  findMany(
    filters: ListTriggeredAlertsFilters,
  ): Promise<PaginatedResult<TriggeredAlert>>;
  findById(id: number): Promise<TriggeredAlert | null>;
  acknowledge(id: number, userId: number): Promise<TriggeredAlert | null>;
  existsForReadingAndConfig(
    readingId: number,
    alertConfigId: number,
  ): Promise<boolean>;
}
