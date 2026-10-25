export type HealthState = 'checking' | 'ok' | 'database-down' | 'api-down';

const LABELS: Record<HealthState, string> = {
  checking: 'Checking the API…',
  ok: 'API and database connected',
  'database-down': 'API running, database disconnected',
  'api-down': 'API not reachable',
};

/** Shows the result of the API's GET /health, which the page checks every few seconds. */
export function HealthBadge({ state }: { state: HealthState }) {
  return (
    <p className={`health health--${state}`} role="status">
      <span className="health__dot" aria-hidden="true" />
      {LABELS[state]}
    </p>
  );
}
