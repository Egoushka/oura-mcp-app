import pg from "pg"

// Read-only view of the Oura warehouse. Column names are never interpolated
// from user input — a request picks a key from METRICS and nothing else.
export const METRICS = {
  sleep_score: { column: "sleep_score", label: "Sleep score", unit: "" },
  readiness_score: { column: "readiness_score", label: "Readiness score", unit: "" },
  activity_score: { column: "activity_score", label: "Activity score", unit: "" },
  hrv_avg: { column: "hrv_avg", label: "HRV (average)", unit: "ms" },
  rhr_lowest: { column: "rhr_lowest", label: "Resting heart rate (lowest)", unit: "bpm" },
  temp_deviation: { column: "temp_deviation", label: "Temperature deviation", unit: "°C" },
  spo2_avg: { column: "spo2_avg", label: "SpO2 (average)", unit: "%" },
  steps: { column: "steps", label: "Steps", unit: "" },
} as const

export type MetricKey = keyof typeof METRICS

export interface Point { day: string; value: number }

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  idleTimeoutMillis: 30_000,
  // The warehouse is on the same host; fail fast rather than hang a tool call.
  connectionTimeoutMillis: 5_000,
})

export async function trend(metric: MetricKey, days: number): Promise<Point[]> {
  const { column } = METRICS[metric]
  const { rows } = await pool.query(
    `select day::text as day, ${column}::float8 as value
       from daily
      where ${column} is not null
        and day > current_date - $1::int
      order by day`,
    [days],
  )
  return rows as Point[]
}

export async function close(): Promise<void> {
  await pool.end()
}
