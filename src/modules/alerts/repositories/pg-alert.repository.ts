import type { Pool } from "pg";

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

const CONFIG_COLUMNS = `
  id,
  manager_user_id,
  sensor_id,
  reference_value::float8 AS reference_value,
  comparison_operator,
  message,
  active,
  created_at
`;

const TRIGGERED_COLUMNS = `
  id,
  alert_config_id,
  reading_id,
  acknowledged_by,
  triggered_at,
  acknowledged_at
`;

type WithTotal<T> = T & { total_records: string };

function stripTotal<T extends object>(rows: WithTotal<T>[]): T[] {
  return rows.map(({ total_records: _ignored, ...row }) => row as unknown as T);
}

export class PgAlertConfigRepository implements AlertConfigRepository {
  constructor(private readonly database: Pool) {}

  async create(data: CreateAlertConfigData): Promise<AlertConfig> {
    const result = await this.database.query<AlertConfig>(
      `
        INSERT INTO alert_configs
          (manager_user_id, sensor_id, reference_value, comparison_operator, message, active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING ${CONFIG_COLUMNS}
      `,
      [
        data.manager_user_id,
        data.sensor_id,
        data.reference_value,
        data.comparison_operator,
        data.message,
        data.active,
      ],
    );

    return result.rows[0]!;
  }

  async findMany(
    filters: ListAlertConfigsFilters,
  ): Promise<PaginatedResult<AlertConfig>> {
    const offset = (filters.page - 1) * filters.limit;

    const result = await this.database.query<WithTotal<AlertConfig>>(
      `
        SELECT ${CONFIG_COLUMNS}, COUNT(*) OVER() AS total_records
        FROM alert_configs
        WHERE ($1::int IS NULL OR sensor_id = $1::int)
          AND ($2::int IS NULL OR manager_user_id = $2::int)
        ORDER BY id ASC
        LIMIT $3 OFFSET $4
      `,
      [
        filters.sensor_id ?? null,
        filters.manager_user_id ?? null,
        filters.limit,
        offset,
      ],
    );

    return {
      data: stripTotal(result.rows),
      total_records: Number(result.rows[0]?.total_records ?? 0),
    };
  }

  async findById(id: number): Promise<AlertConfig | null> {
    const result = await this.database.query<AlertConfig>(
      `SELECT ${CONFIG_COLUMNS} FROM alert_configs WHERE id = $1`,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async findActiveBySensorId(sensorId: number): Promise<AlertConfig[]> {
    const result = await this.database.query<AlertConfig>(
      `SELECT ${CONFIG_COLUMNS} FROM alert_configs WHERE sensor_id = $1 AND active = true`,
      [sensorId],
    );

    return result.rows;
  }

  async update(
    id: number,
    data: UpdateAlertConfigData,
  ): Promise<AlertConfig | null> {
    const result = await this.database.query<AlertConfig>(
      `
        UPDATE alert_configs
        SET manager_user_id = $2,
            sensor_id = $3,
            reference_value = $4,
            comparison_operator = $5,
            message = $6,
            active = $7
        WHERE id = $1
        RETURNING ${CONFIG_COLUMNS}
      `,
      [
        id,
        data.manager_user_id,
        data.sensor_id,
        data.reference_value,
        data.comparison_operator,
        data.message,
        data.active,
      ],
    );

    return result.rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.database.query(
      `DELETE FROM alert_configs WHERE id = $1`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async sensorExists(sensorId: number): Promise<boolean> {
    const result = await this.database.query(
      `SELECT 1 FROM sensors WHERE id = $1`,
      [sensorId],
    );

    return (result.rowCount ?? 0) > 0;
  }
}

export class PgTriggeredAlertRepository implements TriggeredAlertRepository {
  constructor(private readonly database: Pool) {}

  async create(data: {
    alert_config_id: number;
    reading_id: number;
  }): Promise<TriggeredAlert> {
    const result = await this.database.query<TriggeredAlert>(
      `
        INSERT INTO triggered_alerts (alert_config_id, reading_id)
        VALUES ($1, $2)
        RETURNING ${TRIGGERED_COLUMNS}
      `,
      [data.alert_config_id, data.reading_id],
    );

    return result.rows[0]!;
  }

  async findMany(
    filters: ListTriggeredAlertsFilters,
  ): Promise<PaginatedResult<TriggeredAlert>> {
    const offset = (filters.page - 1) * filters.limit;

    const result = await this.database.query<WithTotal<TriggeredAlert>>(
      `
        SELECT ${TRIGGERED_COLUMNS}, COUNT(*) OVER() AS total_records
        FROM triggered_alerts
        WHERE (
          $1::boolean IS NULL
          OR ($1::boolean = true AND acknowledged_at IS NOT NULL)
          OR ($1::boolean = false AND acknowledged_at IS NULL)
        )
        ORDER BY triggered_at DESC, id DESC
        LIMIT $2 OFFSET $3
      `,
      [filters.acknowledged ?? null, filters.limit, offset],
    );

    return {
      data: stripTotal(result.rows),
      total_records: Number(result.rows[0]?.total_records ?? 0),
    };
  }

  async findById(id: number): Promise<TriggeredAlert | null> {
    const result = await this.database.query<TriggeredAlert>(
      `SELECT ${TRIGGERED_COLUMNS} FROM triggered_alerts WHERE id = $1`,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async acknowledge(
    id: number,
    userId: number,
  ): Promise<TriggeredAlert | null> {
    const result = await this.database.query<TriggeredAlert>(
      `
        UPDATE triggered_alerts
        SET acknowledged_by = $2, acknowledged_at = current_timestamp
        WHERE id = $1
        RETURNING ${TRIGGERED_COLUMNS}
      `,
      [id, userId],
    );

    return result.rows[0] ?? null;
  }

  async existsForReadingAndConfig(
    readingId: number,
    alertConfigId: number,
  ): Promise<boolean> {
    const result = await this.database.query(
      `SELECT 1 FROM triggered_alerts WHERE reading_id = $1 AND alert_config_id = $2`,
      [readingId, alertConfigId],
    );

    return (result.rowCount ?? 0) > 0;
  }
}
