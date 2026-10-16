import { useState, type SubmitEvent } from 'react';
import {
  AuthError,
  apiFetch,
  type Classification,
  type ReviewResult,
} from './api';

interface ReviewFormProps {
  id: string;
  token: string;
  onReviewed: (result: ReviewResult) => void;
  onAuthError: () => void;
}

type Decision = 'approved' | 'rejected';

export default function ReviewForm({
  id,
  token,
  onReviewed,
  onAuthError,
}: ReviewFormProps) {
  const [decision, setDecision] = useState<Decision | null>(
    null,
  );
  const [classification, setClassification] =
    useState<Classification | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (
      decision === null ||
      classification === null ||
      note.trim() === ''
    ) {
      setError(
        'Choose a decision and a classification, and leave a note.',
      );
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const result = await apiFetch<ReviewResult>(
        `/findings/${id}/review`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            classification,
            note: note.trim(),
          }),
        },
      );
      onReviewed(result);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save the review.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className='review-form'>
      <fieldset>
        <legend>Is the AI's severity right?</legend>
        <label>
          <input
            type='radio'
            name='decision'
            value='approved'
            checked={decision === 'approved'}
            onChange={() => setDecision('approved')}
            required
          />
          Approve - the severity is right
        </label>
        <label>
          <input
            type='radio'
            name='deision'
            value='rejected'
            checked={decision === 'rejected'}
            onChange={() => setDecision('rejected')}
          />
          Reject - the severity is wrong
        </label>
      </fieldset>

      <fieldset>
        <legend>What was the activity?</legend>
        <label>
          <input
            type='radio'
            name='classification'
            value='true_positive'
            checked={classification === 'true_positive'}
            onChange={() =>
              setClassification('true_positive')
            }
            required
          />
          True positive - real and unwanted
        </label>
        <label>
          <input
            type='radio'
            name='classification'
            value='benign_positive'
            checked={classification === 'benign_positive'}
            onChange={() =>
              setClassification('benign_positive')
            }
          />
          Benign positive - real, but expected or authorized
        </label>
        <label>
          <input
            type='radio'
            name='classification'
            value='false_positive'
            checked={classification === 'false_positive'}
            onChange={() =>
              setClassification('false_positive')
            }
          />
          False positive - the finding is wrong about what
          happened
        </label>
      </fieldset>

      <label htmlFor='review-note'>Note</label>
      <textarea
        id='review-note'
        rows={4}
        maxLength={2000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        required
      />

      {error && <p role='alert'>{error}</p>}

      <button type='submit' disabled={saving}>
        {saving ? 'Saving...' : 'Submit review'}
      </button>
    </form>
  );
}
