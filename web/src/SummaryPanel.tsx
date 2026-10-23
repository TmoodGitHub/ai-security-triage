import { useEffect, useState } from 'react';
import {
  AuthError,
  apiFetch,
  type Filters,
  type FindingsSummary,
  type Severity,
} from './api';

interface SummaryPanelProps {
  token: string;
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  onAuthError: () => void;
}

const SEVERITY_ORDER: { value: Severity; label: string }[] =
  [
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

export default function SummaryPanel({
  token,
  filters,
  onFilterChange,
  onAuthError,
}: SummaryPanelProps) {
  const [summary, setSummary] =
    useState<FindingsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<FindingsSummary>('/findings/summary', token)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) onAuthError();
        else setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [token, onAuthError]);

  if (error) {
    return (
      <p role='alert'>
        Could not load the summary: {error}
      </p>
    );
  }
  if (summary === null) {
    return null;
  }

  const reviewed = summary.approved + summary.rejected;
  const rate = summary.agreementRate;

  return (
    <section
      className='summary'
      aria-labelledby='summary-heading'
    >
      <h2 id='summary-heading'>Awaiting review</h2>
      <div className='summary-row'>
        <ul className='queue'>
          {SEVERITY_ORDER.map(({ value, label }) => {
            const active =
              filters.severity === value &&
              filters.status === 'pending';
            return (
              <li key={value}>
                <button
                  type='button'
                  className={`queue-item queue-${value}`}
                  aria-pressed={active}
                  onClick={() =>
                    onFilterChange({
                      severity: value,
                      status: 'pending',
                    })
                  }
                >
                  <span className='queue-count'>
                    {summary.pendingBySeverity[value]}
                  </span>{' '}
                  <span className='queue-label'>
                    {label}
                  </span>
                  <span className='visually-hidden'>
                    {' '}
                    pending, show these
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className='agreement'>
          <p className='agreement-rate'>
            <span className='agreement-value'>
              {rate === null
                ? '-'
                : `${Math.round(rate * 100)}%`}
            </span>
            {'  '}
            AI agreement
          </p>
          {rate !== null && (
            <div
              className='agreement-bar'
              aria-hidden='true'
            >
              <span style={{ width: `${rate * 100}%` }} />
            </div>
          )}
          <p className='agreement-detail'>
            {rate === null
              ? 'No findings reviewed yet'
              : `Analysts approved the AI's severity on ${summary.approved} of ${reviewed} reviewed findings`}
          </p>
        </div>
      </div>
    </section>
  );
}
