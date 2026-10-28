// Where the MySQL database is, from environment variables. Shared by the app
// (src/db/index.ts), app.cjs (migrations on start) and drizzle.config.ts.
// CommonJS so app.cjs can load it before anything is built.
//
// Either one DATABASE_URL (mysql://user:password@host:port/database), or
// separate variables. Hosts name those differently (GoDaddy gives each app
// its own MySQL database and passes its details in variables), so the common
// spellings are all accepted.

const pick = (env, names) => {
  for (const n of names) if (env[n]) return { name: n, value: env[n] };
  return null;
};

const NAMES = {
  host: ["MYSQL_HOST", "DB_HOST", "DATABASE_HOST", "MYSQLHOST"],
  port: ["MYSQL_PORT", "DB_PORT", "DATABASE_PORT", "MYSQLPORT"],
  database: ["MYSQL_DATABASE", "MYSQL_DB", "DB_NAME", "DB_DATABASE", "DATABASE_NAME", "MYSQLDATABASE"],
  user: ["MYSQL_USER", "MYSQL_USERNAME", "DB_USER", "DB_USERNAME", "DATABASE_USER", "MYSQLUSER"],
  password: ["MYSQL_PASSWORD", "DB_PASSWORD", "DB_PASS", "DATABASE_PASSWORD", "MYSQLPASSWORD"],
};

/** mysql2 connection options, or throws saying which variables to set. */
function connectionOptions(env = process.env) {
  // Encrypted connections, if the host requires them: MYSQL_SSL=true.
  const ssl = /^(1|true|required)$/i.test(env.MYSQL_SSL ?? env.DB_SSL ?? "") ? { ssl: {} } : {};
  return { ...baseOptions(env), ...ssl };
}

function baseOptions(env) {
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must start with mysql://");
    return {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ""),
    };
  }
  const found = Object.fromEntries(Object.entries(NAMES).map(([k, names]) => [k, pick(env, names)]));
  const missing = ["host", "database", "user"].filter((k) => !found[k]);
  if (missing.length) {
    throw new Error(
      "No database set. Set DATABASE_URL=mysql://user:password@host:3306/database, or " +
        missing.map((k) => NAMES[k][0]).join(", ") +
        " (with MYSQL_PASSWORD and MYSQL_PORT if needed).",
    );
  }
  return {
    host: found.host.value,
    port: Number(found.port?.value) || 3306,
    user: found.user.value,
    password: found.password?.value ?? "",
    database: found.database.value,
  };
}

/** "tracker on 127.0.0.1:3306", for logs; never the password. */
function describe(options) {
  return `${options.database} on ${options.host}:${options.port}`;
}

/** The same database URL, for drizzle-kit. */
function toUrl(o) {
  const auth = `${encodeURIComponent(o.user)}${o.password ? `:${encodeURIComponent(o.password)}` : ""}`;
  return `mysql://${auth}@${o.host}:${o.port}/${encodeURIComponent(o.database)}`;
}

module.exports = { connectionOptions, describe, toUrl };
