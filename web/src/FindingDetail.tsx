import { useEffect, useRef, useState } from 'react';
import {
  AuthError,
  apiFetch,
  type FindingDetail as Finding,
} from './api';

interface FindingDetailProps {
  id: string;
  token: string;
  onBack: () => void;
  onAuthError: () => void;
}

const CLASSIFICATION_LABELS = {
  true_positive: 'True positive',
  benign_positive: 'Benign positive',
  false_positive: 'False positive',
};

export default function FindingDetail({
  id,
  token,
  onBack,
  onAuthError,
}: FindingDetailProps) {
  const [finding, setFinding] = useState<Finding | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    setFinding(null);
    setError(null);

    apiFetch<Finding>(`/findings/${id}`, token)
      .then((data) => {
        if (!cancelled) setFinding(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof AuthError) onAuthError();
        else setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [id, token, onAuthError]);

  useEffect(() => {
    if (finding !== null) {
      headingRef.current?.focus();
    }
  }, [finding]);

  return (
    <section aria-labelledby='detail-heading'>
      <button type='button' onClick={onBack}>
        &larr; Back to findings
      </button>

      {error && <p role='alert'>{error}</p>}
      {error === null && finding === null && (
        <p>Loading...</p>
      )}

      {finding && (
        <>
          <h2
            id='detail-heading'
            ref={headingRef}
            tabIndex={-1}
          >
            {finding.summary}
          </h2>
          <dl className='facts'>
            <dt>Severity</dt>
            <dd>
              <span
                className={`severity severity-${finding.severity}`}
              >
                {finding.severity}
              </span>
            </dd>
            <dt>Status</dt>
            <dd>{finding.reviewStatus}</dd>
            <dt>Model</dt>
            <dd>{finding.model}</dd>
            <dt>Triaged</dt>
            <dd>
              {new Date(finding.createdAt).toLocaleString()}
            </dd>
          </dl>

          <h3>Why the AI chose this severity</h3>
          <p>{finding.reasoning}</p>

          <h3>Evidence</h3>
          <ul>
            {finding.evidence.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>

          <h3>Unknowns</h3>
          {finding.unknowns.length > 0 ? (
            <ul>
              {finding.unknowns.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>None listed.</p>
          )}

          <h3>Review</h3>
          {finding.reviewStatus === 'pending' ? (
            <p>Not reviewed yet.</p>
          ) : (
            <dl className='facts'>
              <dt>Decision</dt>
              <dd>{finding.reviewStatus}</dd>
              <dt>Classification</dt>
              <dd>
                {finding.classification
                  ? CLASSIFICATION_LABELS[
                      finding.classification
                    ]
                  : '-'}
              </dd>
              <dt>Reviewed by</dt>
              <dd>{finding.reviewedBy ?? '-'}</dd>
              <dt>Reviewed at</dt>
              <dd>
                {finding.reviewedAt
                  ? new Date(
                      finding.reviewedAt,
                    ).toLocaleString()
                  : '-'}
              </dd>
              <dt>Note</dt>
              <dd>{finding.reviewNote}</dd>
            </dl>
          )}

          <details>
            <summary>Raw CloudTrail event</summary>
            <pre>
              {JSON.stringify(finding.event, null, 2)}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
