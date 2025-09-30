import { useState, useEffect } from 'react';
import axios from 'axios';
import StatsDashboard from './components/StatsDashboard';
import AdminPanel from './components/AdminPanel';
import ThemeToggle from './components/ThemeToggle';
import './index.css';

function App() {
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [commands, setCommands] = useState([]);
  const [error, setError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (token) fetchCommands();
  }, [token]);

  const fetchCommands = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/commands', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCommands(response.data);
    } catch (error) {
      setError('Failed to fetch command history.');
    }
  };

  const handleRegister = async () => {
    try {
      await axios.post('http://localhost:3001/api/register', { username, password });
      setIsRegistering(false);
      setError('');
    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed.');
    }
  };

  const handleLogin = async () => {
    try {
      const response = await axios.post('http://localhost:3001/api/login', { username, password });
      setToken(response.data.token);
      setError('');
    } catch (error) {
      setError(error.response?.data?.error || 'Login failed.');
    }
  };

  const handleRunCommand = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(
        'http://localhost:3001/api/run-nexa',
        { command },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOutput(response.data.output || 'Command executed successfully!');
      fetchCommands();
    } catch (error) {
      setOutput('');
      setError(error.response?.data?.error || 'Failed to run command.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ThemeToggle />
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '20px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '16px',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        {!token ? (
          <div style={{ width: '95%', maxWidth: '400px', margin: '0 auto' }}>
            <h1 style={{ color: 'var(--text-color)' }}>{isRegistering ? 'Register' : 'Login'}</h1>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              style={{
                width: '100%',
                padding: '10px',
                margin: '10px 0',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: 'var(--text-color)',
              }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              style={{
                width: '100%',
                padding: '10px',
                margin: '10px 0',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: 'var(--text-color)',
              }}
            />
            {isRegistering ? (
              <>
                <button
                  onClick={handleRegister}
                  style={{
                    width: '100%',
                    padding: '10px',
                    margin: '10px 0',
                    background: 'var(--button-bg)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                  }}
                >
                  Register
                </button>
                <button
                  onClick={() => setIsRegistering(false)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    margin: '10px 0',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                  }}
                >
                  Back to Login
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleLogin}
                  style={{
                    width: '100%',
                    padding: '10px',
                    margin: '10px 0',
                    background: 'var(--button-bg)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                  }}
                >
                  Login
                </button>
                <button
                  onClick={() => setIsRegistering(true)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    margin: '10px 0',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '8px',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                  }}
                >
                  Register
                </button>
              </>
            )}
            {error && <p style={{ color: 'red' }}>{error}</p>}
          </div>
        ) : (
          <div>
            <h1 style={{ color: 'var(--text-color)' }}>Nexa CLI App</h1>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter Nexa command"
              style={{
                width: '100%',
                padding: '10px',
                margin: '10px 0',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: 'var(--text-color)',
              }}
            />
            <button
              onClick={handleRunCommand}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                margin: '10px 0',
                background: 'var(--button-bg)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: 'var(--text-color)',
                cursor: 'pointer',
              }}
            >
              {loading ? 'Running...' : 'Run Command'}
            </button>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            <div>
              <strong>Output:</strong>
              <pre style={{ color: 'var(--text-color)' }}>{output}</pre>
            </div>
            <StatsDashboard token={token} />
            {username === 'admin' && <AdminPanel token={token} />}
          </div>
        )}
      </div>
    </>
  );
}

export default App;
