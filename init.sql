-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    default_model VARCHAR(255) DEFAULT 'NexaAI/OmniNeural-4B',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create commands table
CREATE TABLE IF NOT EXISTS commands (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    command TEXT NOT NULL,
    output TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create command_stats table
CREATE TABLE IF NOT EXISTS command_stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    total_commands INTEGER DEFAULT 0,
    avg_command_length FLOAT DEFAULT 0,
    active_duration_seconds INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create rate_limits table (for persistent if needed)
CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    endpoint VARCHAR(255),
    requests INTEGER DEFAULT 0,
    last_request TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reset_time TIMESTAMP
);