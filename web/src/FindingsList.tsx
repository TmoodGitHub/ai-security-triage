import { useEffect, useRef, useState } from 'react';
import {
  AuthError,
  apiFetch,
  type Filters,
  type FindingSummary,
  type ReviewStatus,
  type Severity,
} from './api';
import { usePageTitle } from './usePageTitle';

interface FindingListProps {
  token: string;
  filters: Filters;
  focusId: string | null;
  onFilterChange: (filters: Filters) => void;
  onSelect: (id: string) => void;
  onAuthError: () => void;
}

export default function FindingsList({
  token,
  filters,
  focusId,
  onFilterChange,
  onSelect,
  onAuthError,
}: FindingListProps) {
  const { severity, status } = filters;
  const params = new URLSearchParams();
  if (severity) params.set('severity', severity);
  if (status) params.set('status', status);
  const query = params.toString();

  const [result, setResult] = useState<{
    query: string;
    findings: FindingSummary[] | null;
    error: string | null;
  } | null>(null);
  const current = result?.query === query ? result : null;
  const findings = current?.findings ?? null;
  const error = current?.error ?? null;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocusId = useRef(focusId);
  usePageTitle('Findings');

  useEffect(() => {
    let cancelled = false;

    apiFetch<{ findings: FindingSummary[] }>(
      `/findings?${query}`,
      token,
    )
      .then((data) => {
        if (!cancelled) {
          setResult({
            query,
            findings: data.findings,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) onAuthError();
        else
          setResult({
            query,
            findings: null,
            error: err.message,
          });
      });

    return () => {
      cancelled = true;
    };
  }, [query, token, onAuthError]);

  useEffect(() => {
    if (
      findings === null ||
      pendingFocusId.current === null
    ) {
      return;
    }
    const row = document.getElementById(
      `finding-${pendingFocusId.current}`,
    );
    (row ?? headingRef.current)?.focus();
    pendingFocusId.current = null;
  }, [findings]);

  return (
    <section aria-labelledby='findings-heading'>
      <h2
        id='findings-heading'
        ref={headingRef}
        tabIndex={-1}
      >
        Findings
      </h2>

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
        <div
          className='table-scroll'
          role='region'
          aria-label='Findings table'
          tabIndex={0}
        >
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
                      id={`finding-${finding.id}`}
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
        </div>
      )}
    </section>
  );
}
