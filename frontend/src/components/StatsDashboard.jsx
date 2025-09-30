import { useState, useEffect } from 'react';
import axios from 'axios';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function StatsDashboard({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsRes, commandsRes] = await Promise.all([
          axios.get('/api/stats', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/commands', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setStats(statsRes.data);
        setCommandHistory(commandsRes.data);
      } catch (error) {
        setError('Failed to fetch data.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const commandData = {
    labels: commandHistory.map((cmd, i) => `Cmd ${i + 1}`),
    datasets: [
      {
        label: 'Command Length',
        data: commandHistory.map(cmd => cmd.command.length),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
      },
      {
        label: 'Output Length',
        data: commandHistory.map(cmd => cmd.output?.length || 0),
        backgroundColor: 'rgba(153, 102, 255, 0.6)',
      },
    ],
  };

  if (loading) return <p>Loading stats...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div className="glass-card">
      <h2>Command Stats</h2>
      {stats && (
        <div>
          <p><strong>Total Commands:</strong> {stats.total_commands}</p>
          <p><strong>Avg Command Length:</strong> {stats.avg_command_length?.toFixed(2)}</p>
          <p><strong>Active Duration (seconds):</strong> {stats.active_duration_seconds?.toFixed(2)}</p>
        </div>
      )}
      <div style={{ height: '300px', marginTop: '20px' }}>
        <Bar
          data={commandData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: 'var(--text-color)' } },
              title: { color: 'var(--text-color)', display: true, text: 'Command/Output Length' },
            },
            scales: {
              x: { ticks: { color: 'var(--text-color)' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
              y: { ticks: { color: 'var(--text-color)' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
            },
          }}
        />
      </div>
    </div>
  );
}
