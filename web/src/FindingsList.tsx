import { useEffect, useState } from 'react';
import {
  AuthError,
  apiFetch,
  type Filters,
  type FindingSummary,
  type ReviewStatus,
  type Severity,
} from './api';

interface FindingListProps {
  token: string;
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  onSelect: (id: string) => void;
  onAuthError: () => void;
}

export default function FindingsList({
  token,
  filters,
  onFilterChange,
  onSelect,
  onAuthError,
}: FindingListProps) {
  const { severity, status } = filters;
  const [findings, setFindings] = useState<
    FindingSummary[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFindings(null);
    setError(null);

    const params = new URLSearchParams();
    if (severity) params.set('severity', severity);
    if (status) params.set('status', status);

    apiFetch<{ findings: FindingSummary[] }>(
      `/findings?${params}`,
      token,
    )
      .then((data) => {
        if (!cancelled) setFindings(data.findings);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) onAuthError();
        else setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [severity, status, token, onAuthError]);

  return (
    <section aria-labelledby='findings-heading'>
      <h2 id='findings-heading'>Findings</h2>

      <div className='filters'>
        <label>
          Severity
          <select
            value={severity}
            onChange={(event) =>
              onFilterChange({
                ...filters,
                severity: event.target.value as
                  | Severity
                  | '',
              })
            }
          >
            <option value=''>All</option>
            <option value='critical'>Critical</option>
            <option value='high'>High</option>
            <option value='medium'>Medium</option>
            <option value='low'>Low</option>
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) =>
              onFilterChange({
                ...filters,
                status: event.target.value as
                  | ReviewStatus
                  | '',
              })
            }
          >
            <option value=''>All</option>
            <option value='pending'>Pending</option>
            <option value='approved'>Approved</option>
            <option value='rejected'>Rejected</option>
          </select>
        </label>
      </div>

      <p aria-live='polite'>
        {error === null &&
          findings === null &&
          'Loading...'}
        {findings !== null &&
          `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`}
      </p>
      {error && <p role='alert'>{error}</p>}

      {findings !== null && findings.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope='col'>Severity</th>
              <th scope='col'>Summary</th>
              <th scope='col'>Event</th>
              <th scope='col'>Who</th>
              <th scope='col'>Source IP</th>
              <th scope='col'>Event time</th>
              <th scope='col'>Status</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => (
              <tr key={finding.id}>
                <td>
                  <span
                    className={`severity severity-${finding.severity}`}
                  >
                    {finding.severity}
                  </span>
                </td>
                <td>
                  <button
                    type='button'
                    className='link-button'
                    onClick={() => onSelect(finding.id)}
                  >
                    {finding.summary}
                  </button>
                </td>
                <td>{finding.eventName}</td>
                <td>{finding.who}</td>
                <td>{finding.sourceIpAddress}</td>
                <td>
                  {new Date(
                    finding.eventTime,
                  ).toLocaleString()}
                </td>
                <td>{finding.reviewStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
