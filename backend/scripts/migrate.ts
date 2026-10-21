// Dev script: runs backend/db/schema.sql against DATABASE_URL to set up / migrate the database.
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const schema = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf-8");

  try {
    await pool.query(schema);
    console.log("Schema applied successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
