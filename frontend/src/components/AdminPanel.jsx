import { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminPanel({ token }) {
  const [rateLimits, setRateLimits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRateLimits = async () => {
      setLoading(true);
      try {
        const response = await axios.get('http://localhost:3001/api/admin/rate-limits', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRateLimits(response.data);
      } catch (error) {
        setError('Failed to fetch rate limits.');
      } finally {
        setLoading(false);
      }
    };
    fetchRateLimits();
  }, [token]);

  const handleReset = async (userId) => {
    try {
      await axios.delete(`http://localhost:3001/api/admin/rate-limits/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRateLimits(rateLimits.filter(limit => limit.user_id !== userId));
    } catch (error) {
      setError('Failed to reset rate limits.');
    }
  };

  if (loading) return <p>Loading rate limits...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div className="glass-card">
      <h2>Admin: Rate Limits</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: '8px', color: 'var(--text-color)' }}>User ID</th>
            <th style={{ border: '1px solid #ddd', padding: '8px', color: 'var(--text-color)' }}>Endpoint</th>
            <th style={{ border: '1px solid #ddd', padding: '8px', color: 'var(--text-color)' }}>Requests</th>
            <th style={{ border: '1px solid #ddd', padding: '8px', color: 'var(--text-color)' }}>Last Request</th>
            <th style={{ border: '1px solid #ddd', padding: '8px', color: 'var(--text-color)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rateLimits.map((limit) => (
            <tr key={`${limit.user_id}-${limit.endpoint}`}>
              <td style={{ border: '1px solid #ddd', padding: '8px', color: 'var(--text-color)' }}>{limit.user_id}</td>
              <td style={{ border: '1px solid #ddd', padding: '8px', color: 'var(--text-color)' }}>{limit.endpoint}</td>
              <td style={{ border: '1px solid #ddd', padding: '8px', color: 'var(--text-color)' }}>{limit.request_count}</td>
              <td style={{ border: '1px solid #ddd', padding: '8px', color: 'var(--text-color)' }}>{new Date(limit.last_request).toLocaleString()}</td>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                <button
                  onClick={() => handleReset(limit.user_id)}
                  style={{
                    background: 'var(--button-bg)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                    padding: '5px 10px',
                  }}
                >
                  Reset
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
