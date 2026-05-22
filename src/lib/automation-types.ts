// Shared automation config — persisted inside Workflow.definitionJson under `automation`.
// No runtime/server dependencies so it is safe to import from client components.

export type TriggerType = 'manual' | 'schedule' | 'automation' | 'webhook';
export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface ScheduleConfig {
  frequency: ScheduleFrequency;
  interval?: number;     // for hourly: every N hours
  time?: string;         // "HH:MM" for daily/weekly/monthly
  dayOfWeek?: number;    // 0-6 (Sun-Sat) for weekly
  dayOfMonth?: number;   // 1-31 for monthly
}

export interface TriggerConfig {
  type: TriggerType;
  schedule?: ScheduleConfig;
  chainedAutomationId?: string;  // for type 'automation'
}

export interface TargetConfig {
  connectorId: string;        // the AFAS integration (Connector.id)
  connectorName?: string;
  updateConnectorId: string;  // the UpdateConnector id within that integration
  updateConnectorLabel?: string;
}

export type SourceKind = 'getconnector' | 'csv';

export interface SourceConfig {
  id: string;            // local unique id within the automation
  kind: SourceKind;
  name: string;          // display name
  connectorId?: string;  // for getconnector: which AFAS Connector.id
  getConnectorId?: string; // for getconnector: the AFAS GetConnector id
  columns?: string[];    // known columns (csv, or sampled getconnector)
  rows?: Record<string, string>[]; // csv: full rows stored inline
  joinKey?: string;      // column used to join this source to the primary source
}

export interface TranslationTable {
  id: string;
  name: string;
  entries: { source: string; target: string }[];
}

export type MappingMode = 'none' | 'fixed' | 'source';

export interface FieldMapping {
  targetField: string;        // path-qualified field id from the UpdateConnector
  targetLabel?: string;
  required: boolean;
  dataType?: string;
  mode: MappingMode;
  fixedValue?: string;
  sourceId?: string;          // SourceConfig.id
  sourceField?: string;       // column in that source
  translationTableId?: string;
}

export interface AutomationConfig {
  description?: string;
  trigger: TriggerConfig;
  target: TargetConfig;
  sources: SourceConfig[];
  translationTables: TranslationTable[];
  mappings: FieldMapping[];
}

export function describeSchedule(s?: ScheduleConfig): string {
  if (!s) return '';
  switch (s.frequency) {
    case 'hourly':  return `Elke ${s.interval && s.interval > 1 ? `${s.interval} uur` : 'uur'}`;
    case 'daily':   return `Dagelijks om ${s.time ?? '09:00'}`;
    case 'weekly':  return `Wekelijks (${['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'][s.dayOfWeek ?? 1]}) om ${s.time ?? '09:00'}`;
    case 'monthly': return `Maandelijks op dag ${s.dayOfMonth ?? 1} om ${s.time ?? '09:00'}`;
    default:        return '';
  }
}
