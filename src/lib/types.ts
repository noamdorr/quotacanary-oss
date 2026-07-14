export type ToolIntegrationType = "api" | "manual_only"
export type ConnectionStatus = "active" | "stale" | "error" | "disconnected"
export type ViewMode = "table" | "cards"
export type NotifyMode = "off" | "critical" | "low_and_critical"
export type AlertLevel = "none" | "low" | "critical"
export type AlertDeliveryLevel = Exclude<AlertLevel, "none">
export type AlertDestinationKind = "webhook" | "slack_webhook"

export type CredentialField = {
  name: string
  label: string
  type: "text" | "password"
  placeholder?: string
}

export type PoolDef = {
  credit_type: string
  label: string
  unit: string
}

export type PoolThresholds = Record<
  string,
  { low: number | null; critical: number | null }
>

export type Tool = {
  id: string
  name: string
  logo_url: string | null
  api_docs_url: string | null
  key_instructions: string | null
  category: string | null
  description: string | null
  website_url: string | null
  integration_type: ToolIntegrationType
  default_alert_threshold: number | null
  default_low_threshold: number | null
  topup_url: string | null
  is_active: boolean
  pools: PoolDef[] | null
  credential_fields: CredentialField[] | null
}

export type Connection = {
  id: string
  user_id: string
  tool_id: string
  connection_type: "api" | "manual"
  encrypted_key: string | null
  key_hint: string | null
  name: string
  tags: string[]
  status: ConnectionStatus
  alert_enabled: boolean
  alert_threshold: number | null
  low_threshold: number | null
  alert_fired_at: string | null
  notified_level: AlertLevel
  last_error: string | null
  consecutive_failures: number
  watched_credit_types: string[] | null
  pool_thresholds: PoolThresholds | null
  created_at: string
  updated_at: string
}

export type Balance = {
  id: string
  connection_id: string
  credit_type: string
  label: string
  balance: number
  balance_limit: number | null
  unit: string
  recorded_at: string
  created_at: string
}

export type ToolRequest = {
  id: string
  user_id: string
  tool_name: string
  note: string | null
  created_at: string
}

export type AlertEvent = {
  id: string
  user_id: string
  connection_id: string | null
  level: AlertDeliveryLevel
  tool_name: string
  connection_name: string
  title: string
  body: string
  pools: {
    label: string
    balance: number
    threshold: number
    unit: string | null
  }[]
  dashboard_url: string
  topup_url: string | null
  read_at: string | null
  created_at: string
}

export type AlertDestination = {
  id: string
  user_id: string
  kind: AlertDestinationKind
  name: string
  url_hint: string
  min_level: AlertDeliveryLevel
  is_enabled: boolean
  last_sent_at: string | null
  last_error: string | null
  consecutive_failures: number
  created_at: string
  updated_at: string
}

export type PoolView = {
  creditType: string
  label: string
  unit: string
  balance: number
  balanceLimit: number | null
  recorded_at: string
  history: { balance: number; recorded_at: string }[]
}

// A connection joined with its tool metadata, most-recent balance, and a
// bounded slice of recent readings (most-recent-first) for trend + burn rate.
export type ConnectionWithBalance = Connection & {
  tool: Pick<
    Tool,
    | "id"
    | "name"
    | "logo_url"
    | "topup_url"
    | "default_low_threshold"
    | "default_alert_threshold"
    | "pools"
    | "credential_fields"
  >
  pools: PoolView[]
}
