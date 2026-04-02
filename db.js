const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

async function initDatabase() {
  const p = getPool();
  if (!p) return false;

  await p.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      session_id TEXT PRIMARY KEY,
      messages JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  return true;
}

async function getConversation(sessionId) {
  const p = getPool();
  if (!p) return null;

  const result = await p.query(
    'SELECT messages FROM conversations WHERE session_id = $1',
    [sessionId]
  );
  return result.rows.length > 0 ? result.rows[0].messages : null;
}

async function saveConversation(sessionId, messages) {
  const p = getPool();
  if (!p) return false;

  await p.query(
    `INSERT INTO conversations (session_id, messages, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (session_id)
     DO UPDATE SET messages = $2, updated_at = NOW()`,
    [sessionId, JSON.stringify(messages)]
  );
  return true;
}

async function deleteConversation(sessionId) {
  const p = getPool();
  if (!p) return false;

  await p.query('DELETE FROM conversations WHERE session_id = $1', [sessionId]);
  return true;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Allow tests to inject a mock pool
function setPool(mockPool) {
  pool = mockPool;
}

module.exports = {
  initDatabase,
  getConversation,
  saveConversation,
  deleteConversation,
  closePool,
  setPool
};
