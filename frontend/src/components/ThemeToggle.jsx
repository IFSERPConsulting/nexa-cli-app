import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggleTheme}
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'var(--button-bg)',
        border: 'var(--glass-border)',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        cursor: 'pointer',
        zIndex: 1000,
        color: 'var(--text-color)',
      }}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
