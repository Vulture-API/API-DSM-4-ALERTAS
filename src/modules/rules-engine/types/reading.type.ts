export type Reading = {
  id: number;
  sensor_id: number;
  value: number;
  unix_time: number;
  data_consistent: boolean;
  created_at: Date;
};

export type ProcessingCheckpoint = {
  last_reading_id: number;
};

export type ProcessingResult = {
  readings_processed: number;
  alerts_triggered: number;
  last_reading_id: number;
};
