import type {
  AlertConfigRepository,
  TriggeredAlertRepository,
} from "@/modules/alerts/repositories/alert.repository.js";
import type {
  AlertConfig,
  CreateAlertConfigData,
  ListAlertConfigsFilters,
  ListTriggeredAlertsFilters,
  PaginatedResult,
  TriggeredAlert,
  UpdateAlertConfigData,
} from "@/modules/alerts/types/alert.type.js";

const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

export class InMemoryAlertConfigRepository implements AlertConfigRepository {
  public readonly configs: AlertConfig[] = [];
  public readonly sensorIds = new Set<number>([1, 2, 3]);

  private nextId = 1;

  async create(data: CreateAlertConfigData): Promise<AlertConfig> {
    const config: AlertConfig = {
      id: this.nextId++,
      ...data,
      created_at: FIXED_DATE,
    };

    this.configs.push(config);

    return config;
  }

  async findMany(
    filters: ListAlertConfigsFilters,
  ): Promise<PaginatedResult<AlertConfig>> {
    const filtered = this.configs.filter(
      (config) =>
        (filters.sensor_id === undefined ||
          config.sensor_id === filters.sensor_id) &&
        (filters.manager_user_id === undefined ||
          config.manager_user_id === filters.manager_user_id),
    );

    const offset = (filters.page - 1) * filters.limit;

    return {
      data: filtered.slice(offset, offset + filters.limit),
      total_records: filtered.length,
    };
  }

  async findById(id: number): Promise<AlertConfig | null> {
    return this.configs.find((config) => config.id === id) ?? null;
  }

  async findActiveBySensorId(sensorId: number): Promise<AlertConfig[]> {
    return this.configs.filter(
      (config) => config.sensor_id === sensorId && config.active,
    );
  }

  async update(
    id: number,
    data: UpdateAlertConfigData,
  ): Promise<AlertConfig | null> {
    const config = this.configs.find((item) => item.id === id);

    if (!config) return null;

    Object.assign(config, data);

    return config;
  }

  async delete(id: number): Promise<boolean> {
    const index = this.configs.findIndex((config) => config.id === id);

    if (index === -1) return false;

    this.configs.splice(index, 1);

    return true;
  }

  async sensorExists(sensorId: number): Promise<boolean> {
    return this.sensorIds.has(sensorId);
  }
}

export class InMemoryTriggeredAlertRepository implements TriggeredAlertRepository {
  public readonly alerts: TriggeredAlert[] = [];

  private nextId = 1;

  async create(data: {
    alert_config_id: number;
    reading_id: number;
  }): Promise<TriggeredAlert | null> {
    // Mesmas restrições dos índices únicos do banco.
    const duplicate = this.alerts.some(
      (alert) =>
        alert.alert_config_id === data.alert_config_id &&
        (alert.acknowledged_at === null ||
          alert.reading_id === data.reading_id),
    );
    if (duplicate) return null;

    const alert: TriggeredAlert = {
      id: this.nextId++,
      alert_config_id: data.alert_config_id,
      reading_id: data.reading_id,
      acknowledged_by: null,
      triggered_at: FIXED_DATE,
      acknowledged_at: null,
      reading_value: null,
      reading_unix_time: null,
    };

    this.alerts.push(alert);

    return alert;
  }

  async findMany(
    filters: ListTriggeredAlertsFilters,
  ): Promise<PaginatedResult<TriggeredAlert>> {
    const filtered = this.alerts.filter((alert) => {
      if (filters.acknowledged === undefined) return true;

      return filters.acknowledged
        ? alert.acknowledged_at !== null
        : alert.acknowledged_at === null;
    });

    const offset = (filters.page - 1) * filters.limit;

    return {
      data: filtered.slice(offset, offset + filters.limit),
      total_records: filtered.length,
    };
  }

  async findById(id: number): Promise<TriggeredAlert | null> {
    return this.alerts.find((alert) => alert.id === id) ?? null;
  }

  async acknowledge(
    id: number,
    userId: number,
  ): Promise<TriggeredAlert | null> {
    const alert = this.alerts.find((item) => item.id === id);

    if (!alert || alert.acknowledged_at !== null) return null;

    alert.acknowledged_by = userId;
    alert.acknowledged_at = FIXED_DATE;

    return alert;
  }

  async hasPendingForConfig(alertConfigId: number): Promise<boolean> {
    return this.alerts.some(
      (alert) =>
        alert.alert_config_id === alertConfigId &&
        alert.acknowledged_at === null,
    );
  }

  async existsForReadingAndConfig(
    readingId: number,
    alertConfigId: number,
  ): Promise<boolean> {
    return this.alerts.some(
      (alert) =>
        alert.reading_id === readingId &&
        alert.alert_config_id === alertConfigId,
    );
  }
}
