import mysql from "mysql2/promise";

const connection = await mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "123456",
  database: "nation",
});

async function query<T>(conn: mysql.Connection, sql: string) {
  const res = await conn.query(
    sql,
  );

  return res.values().toArray()[0] as unknown as T[];
}

const res = await query<{ name: string }>(
  connection,
  `SELECT * from countries limit 5;`,
);

console.log(res);

connection.end();
