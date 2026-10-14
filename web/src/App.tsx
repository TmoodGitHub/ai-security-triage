import { useEffect, useState } from 'react';

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking...');

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.json())
      .then((body: { status: string }) =>
        setApiStatus(body.status),
      )
      .catch(() => setApiStatus('unreachable'));
  }, []);

  return (
    <main>
      <h1>Security Findings</h1>
      <p>API status: {apiStatus}</p>
    </main>
  );
}
