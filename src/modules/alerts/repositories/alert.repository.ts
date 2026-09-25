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
  /**
   * Cria o alerta de forma atômica. Devolve null (sem erro) quando o banco
   * recusa por duplicidade: a regra já tem alerta pendente, ou esse par
   * (leitura, regra) já foi disparado.
   */
  create(data: {
    alert_config_id: number;
    reading_id: number;
  }): Promise<TriggeredAlert | null>;
  findMany(
    filters: ListTriggeredAlertsFilters,
  ): Promise<PaginatedResult<TriggeredAlert>>;
  findById(id: number): Promise<TriggeredAlert | null>;
  /**
   * Reconhece o alerta só se ele ainda não foi reconhecido (condição aplicada
   * na própria escrita). Devolve null se o alerta não existe ou já estava
   * reconhecido — quem chama distingue os dois casos.
   */
  acknowledge(id: number, userId: number): Promise<TriggeredAlert | null>;
  /** Há alerta desta regra ainda não reconhecido? */
  hasPendingForConfig(alertConfigId: number): Promise<boolean>;
  existsForReadingAndConfig(
    readingId: number,
    alertConfigId: number,
  ): Promise<boolean>;
}
