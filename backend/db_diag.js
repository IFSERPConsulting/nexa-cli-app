require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

console.log('Loaded env from', require('path').join(__dirname, '..', '.env'));
console.log('DB_USER=', process.env.DB_USER);
console.log('DB_PASSWORD type=', typeof process.env.DB_PASSWORD, 'value=', JSON.stringify(process.env.DB_PASSWORD));
console.log('DB_HOST=', process.env.DB_HOST);
console.log('DB_NAME=', process.env.DB_NAME);
console.log('DB_PORT=', process.env.DB_PORT, 'type=', typeof process.env.DB_PORT);

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || undefined,
});

pool.query('SELECT 1').then(r => {
  console.log('DB OK:', r.rows);
  process.exit(0);
}).catch(e => {
  console.error('DB ERROR:', e);
  process.exit(1);
});

