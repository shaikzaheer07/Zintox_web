import pg from "pg";
import Database from "better-sqlite3";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

let useSqlite = false;
let sqliteDb: any = null;
let pgPool: any = null;

// Initialize Postgres connection pool
if (connectionString) {
  pgPool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require") || process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  });
} else {
  pgPool = new Pool({
    host: process.env.SQL_HOST || "localhost",
    port: parseInt(process.env.SQL_PORT || "5432"),
    user: process.env.SQL_USER || "postgres",
    password: process.env.SQL_PASSWORD || "postgres",
    database: process.env.SQL_DB_NAME || "zintox_db",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
}

// Handle idle client errors gracefully
pgPool.on("error", (err: any) => {
  console.error("Unexpected error on idle SQL pool client:", err);
});

let initPromise: Promise<void> | null = null;

export function ensureDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      let pgConnected = false;
      try {
        console.log("Testing PostgreSQL database connection...");
        // Fast timeout check/connect to prevent hanging
        const client = await pgPool.connect();
        client.release();
        pgConnected = true;
        console.log("PostgreSQL connection verified successfully. Using Postgres mode.");
      } catch (err: any) {
        console.log("Database Mode: Local SQLite fallback active.");
        useSqlite = true;
      }

      if (useSqlite) {
        try {
          sqliteDb = new Database("database.sqlite");
          sqliteDb.pragma("journal_mode = WAL");
          console.log("SQLite fallback database initialized successfully.");
        } catch (sqliteErr: any) {
          console.error("Critical: Failed to initialize SQLite database fallback:", sqliteErr);
          throw sqliteErr;
        }
      }
    })();
  }
  return initPromise;
}

// Case-insensitivity mapper for SQLite row records
function copyKeysLowercased(row: any) {
  if (!row || typeof row !== 'object') return row;
  const newRow = { ...row };
  for (const key of Object.keys(row)) {
    const lower = key.toLowerCase();
    if (lower !== key) {
      newRow[lower] = row[key];
    }
  }
  return newRow;
}

// Help translator for PG SQL syntax to SQLite
function translatePgToSqlite(sql: string, params: any[] = []) {
  let translatedSql = sql;

  // 1. Replace $1, $2, ... placeholders with ?
  translatedSql = translatedSql.replace(/\$\d+/g, "?");

  // 2. Translate SERIAL PRIMARY KEY type mapping
  translatedSql = translatedSql.replace(/SERIAL\s+PRIMARY\s+KEY/gi, "INTEGER PRIMARY KEY AUTOINCREMENT");

  // 3. Translate CURRENT_TIMESTAMP interval additions
  translatedSql = translatedSql.replace(/CURRENT_TIMESTAMP\s*\+\s*INTERVAL\s*'1\s+day'/gi, "datetime('now', '+1 day')");
  translatedSql = translatedSql.replace(/CURRENT_TIMESTAMP\s*\+\s*INTERVAL\s*'(\d+)\s+days?'/gi, "datetime('now', '+$1 days')");

  // 4. Translate NOW() interval calculations
  translatedSql = translatedSql.replace(/NOW\(\)\s*-\s*INTERVAL\s*'1\s+day'/gi, "datetime('now', '-1 day')");
  translatedSql = translatedSql.replace(/NOW\(\)\s*-\s*INTERVAL\s*'(\d+)\s+days?'/gi, "datetime('now', '-$1 days')");

  // 5. Replace stand-alone NOW() with datetime('now')
  translatedSql = translatedSql.replace(/NOW\(\)/gi, "datetime('now')");

  // Convert Date object parameters to ISO strings for SQLite compatibility
  const translatedParams = params.map(p => {
    if (p instanceof Date) {
      return p.toISOString();
    }
    return p;
  });

  return { sql: translatedSql, params: translatedParams };
}

// Unified query wrapper supporting both drivers
async function unifiedQuery(sql: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  await ensureDb();

  if (!useSqlite) {
    const result = await pgPool.query(sql, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
    };
  } else {
    const { sql: translatedSql, params: translatedParams } = translatePgToSqlite(sql, params);
    try {
      const stmt = sqliteDb.prepare(translatedSql);
      const isReturning = /returning\s+/i.test(translatedSql);

      if (stmt.reader || isReturning) {
        const rows = stmt.all(translatedParams).map(copyKeysLowercased);
        return {
          rows,
          rowCount: rows.length,
        };
      } else {
        const info = stmt.run(translatedParams);
        return {
          rows: [],
          rowCount: info.changes,
        };
      }
    } catch (err: any) {
      console.error(`SQLite execution error on translated SQL: \n${translatedSql}\nParams:`, translatedParams, err);
      throw err;
    }
  }
}

// Client wrapper mimicking standard PG connection interface
async function unifiedConnect(): Promise<any> {
  await ensureDb();

  if (!useSqlite) {
    return await pgPool.connect();
  } else {
    // Return a mocked client wrapping around sqlite
    return {
      query: async (sql: string, params: any[] = []) => {
        return await unifiedQuery(sql, params);
      },
      release: () => {
        // No-op for SQLite
      }
    };
  }
}

export const dbPool = {
  query: unifiedQuery,
  connect: unifiedConnect,
  on: (event: string, handler: any) => {
    if (pgPool) {
      pgPool.on(event, handler);
    }
  }
};

export async function initDatabase() {
  console.log("Initializing Database Schema...");
  await ensureDb();

  const client = await dbPool.connect();
  try {
    // Begin transaction for table init
    if (useSqlite) {
      sqliteDb.exec("BEGIN TRANSACTION");
    } else {
      await client.query("BEGIN");
    }

    // 1. Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        email TEXT UNIQUE,
        handle TEXT,
        avatarColor TEXT,
        accountType TEXT DEFAULT 'public',
        lastSeen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        password TEXT
      );
    `);

    // Create idx_users_handle index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);
    `);

    // 2. Messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        senderId TEXT,
        receiverId TEXT,
        content TEXT,
        isSnap INTEGER DEFAULT 0,
        snapTimer INTEGER DEFAULT 0,
        openedAt TIMESTAMP,
        emotion TEXT DEFAULT 'neutral',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Chats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        userOne TEXT,
        userTwo TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(userOne, userTwo)
      );
    `);

    // 4. Stories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id SERIAL PRIMARY KEY,
        userId TEXT,
        content TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiresAt TIMESTAMP,
        seenBy TEXT DEFAULT '[]'
      );
    `);

    // 5. Streaks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS streaks (
        userA TEXT,
        userB TEXT,
        count INTEGER DEFAULT 0,
        lastActivity TIMESTAMP,
        PRIMARY KEY (userA, userB)
      );
    `);

    // 6. Follows table
    await client.query(`
      CREATE TABLE IF NOT EXISTS follows (
        followerId TEXT,
        followingId TEXT,
        PRIMARY KEY (followerId, followingId)
      );
    `);

    // 7. Friend requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id SERIAL PRIMARY KEY,
        senderId TEXT,
        receiverId TEXT,
        status TEXT DEFAULT 'pending',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(senderId, receiverId)
      );
    `);

    // 8. Follow requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS follow_requests (
        id SERIAL PRIMARY KEY,
        senderId TEXT,
        receiverId TEXT,
        status TEXT DEFAULT 'pending',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(senderId, receiverId)
      );
    `);

    // 9. Blocks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        blockerId TEXT,
        blockedId TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (blockerId, blockedId)
      );
    `);

    // 10. Notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        userId TEXT,
        fromUserId TEXT,
        type TEXT,
        isRead INTEGER DEFAULT 0,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 11. Posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        userId TEXT,
        imageUrl TEXT,
        caption TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiresAt TIMESTAMP
      );
    `);

    // 12. Likes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS likes (
        userId TEXT,
        postId INTEGER,
        PRIMARY KEY (userId, postId)
      );
    `);

    // 13. Comments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        userId TEXT,
        postId INTEGER,
        content TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    if (useSqlite) {
      sqliteDb.exec("COMMIT");
    } else {
      await client.query("COMMIT");
    }

    console.log("PostgreSQL/SQLite Database Schema initialized successfully.");

    // Seed default AI User
    await dbPool.query(`
      INSERT INTO users (id, username, email, avatarColor, handle)
      VALUES ('ai-assistant', 'Zintox AI', 'ai@zintox.app', '#10b981', 'ai-assistant@gmail.com')
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("Default AI user seeded successfully.");
  } catch (err) {
    if (useSqlite) {
      try { sqliteDb.exec("ROLLBACK"); } catch (e) {}
    } else {
      try { await client.query("ROLLBACK"); } catch (e) {}
    }
    console.error("Failed to initialize system tables:", err);
    throw err;
  } finally {
    client.release();
  }
}
