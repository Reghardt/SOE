import { DatabaseSync } from "node:sqlite";
import { sleep } from "./utils.ts";

const db = new DatabaseSync("test.db");

db.exec(
  `
	CREATE TABLE IF NOT EXISTS machines (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  ideal_cycle_time REAL
	) STRICT;
  `,
);

type TCycleTimes = {
  id: number;
  machine_id: number;
  enter: number;
  exit: number;
  difference: number;
};

db.exec(
  `
	CREATE TABLE IF NOT EXISTS cycle_times (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  machine_id INTEGER,
    enter REAL,
    exit REAL,
    difference REAL,
    FOREIGN KEY(machine_id) REFERENCES machines(id)
	) STRICT;
  `,
);

const machine_1_ideal_cycle_time = 5 / 3;

// db.prepare(
//   `
// 	INSERT INTO machines (ideal_cycle_time) VALUES (?);
//   `,
// ).run(machine_1_ideal_cycle_time); // 1.6666.. seconds

for (let i = 0; i < 5; i++) {
  const enter = Date.now();
  await sleep(machine_1_ideal_cycle_time * 1000 * 2);
  const exit = Date.now();
  db.prepare(
    `
	INSERT INTO cycle_times (machine_id, enter, exit, difference) VALUES (?, ?, ?, ?);
  `,
  ).run(1, enter, exit, exit - enter);
  // await sleep(5000);
}

// const result = db.prepare(
//   `
//   select * from cycle_times
//   `,
// ).all() as TCycleTimes[];

const result = db.prepare(
  `
  select SUM(difference) as difference, COUNT(*) as cycles from cycle_times
  `,
).all() as unknown as { difference: number; cycles: number }[];

const average_cycle_time = result[0].difference / result[0].cycles;
console.log(
  "Cycle efficiency:",
  ((machine_1_ideal_cycle_time * 1000) /
    average_cycle_time) * 100,
);

const lag = db.prepare(
  `
  WITH cycle_gap AS (
    SELECT 
        id,
        machine_id,
        enter - LAG(exit) OVER (ORDER BY id) as cycle_gap
    FROM cycle_times 
    WHERE machine_id = 1
  )
  SELECT SUM(cycle_gap) as sum, COUNT(*) as count
  FROM cycle_gap 
  WHERE cycle_gap IS NOT NULL
  ORDER BY id;
  `,
).all() as unknown as { sum: number; count: number }[];

const average_gap_time = lag[0].sum / lag[0].count; // idle time

console.log(
  `Time Efficiency: ${
    (((machine_1_ideal_cycle_time * 1000) /
      ((machine_1_ideal_cycle_time * 1000) + average_gap_time)) * 100).toFixed(
        2,
      )
  }%`,
);
