import type { CurrentUser, ReviewStatus } from './api';

const QUEUES: {
  label: string;
  status: ReviewStatus | '';
}[] = [
  { label: 'Awaiting review', status: 'pending' },
  { label: 'Approved', status: 'approved' },
  { label: 'Rejected', status: 'rejected' },
  { label: 'All findings', status: '' },
];

interface SidebarProps {
  user: CurrentUser | null;
  activeStatus: ReviewStatus | '';
  onSelectQueue: (status: ReviewStatus | '') => void;
  onSignOut: () => void;
}

export default function Sidebar({
  user,
  activeStatus,
  onSelectQueue,
  onSignOut,
}: SidebarProps) {
  return (
    <aside className='sidebar'>
      <h1>Security findings</h1>
      <nav aria-label='Review queues'>
        <ul>
          {QUEUES.map((queue) => (
            <li key={queue.label}>
              <button
                type='button'
                className='sidebar-link'
                aria-current={
                  activeStatus === queue.status
                    ? 'true'
                    : undefined
                }
                onClick={() => onSelectQueue(queue.status)}
              >
                {queue.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className='sidebar-account'>
        {user && (
          <p>
            Signed in as{' '}
            <span className='sidebar-user'>
              {user.name ?? user.subject}
            </span>
          </p>
        )}
        <button type='button' onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
