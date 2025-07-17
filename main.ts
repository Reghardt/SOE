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

const machine_1_ideal_cycle_time = 5 / 3; //1.66666... seconds
const machine_1_ideal_ppm = machine_1_ideal_cycle_time * 60; // 100 ppm

// db.prepare(
//   `
// 	INSERT INTO machines (ideal_cycle_time) VALUES (?);
//   `,
// ).run(machine_1_ideal_cycle_time); // 1.6666.. seconds

// for (let i = 0; i < 5; i++) {
//   const enter = Date.now();
//   await sleep(machine_1_ideal_cycle_time * 1000 * 1.3);
//   const exit = Date.now();
//   db.prepare(
//     `
// 	INSERT INTO cycle_times (machine_id, enter, exit, difference) VALUES (?, ?, ?, ?);
//   `,
//   ).run(1, enter, exit, exit - enter);
//   await sleep(200);
// }

const result = db.prepare(
  `
  select SUM(difference) as difference, COUNT(*) as cycles from cycle_times
  `,
).all() as unknown as { difference: number; cycles: number }[];

const average_cycle_time = result[0].difference / result[0].cycles;
const cycle_efficiency = ((machine_1_ideal_cycle_time * 1000) /
  average_cycle_time) * 100;
console.log(
  `Cycle efficiency: ${cycle_efficiency.toFixed(2)}%`,
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

const time_efficiency = ((machine_1_ideal_cycle_time * 1000) /
  ((machine_1_ideal_cycle_time * 1000) + average_gap_time)) * 100;
console.log(
  `Time Efficiency: ${
    time_efficiency.toFixed(
      2,
    )
  }%`,
);

const real_ppm = (((cycle_efficiency / 100) * machine_1_ideal_cycle_time) *
  (time_efficiency / 100)) * 60;

console.log(
  `Ideal ppm: ${machine_1_ideal_ppm.toFixed(2)}, Real ppm: ${
    real_ppm.toFixed(2)
  } (${((real_ppm / machine_1_ideal_ppm) * 100).toFixed(2)}%)`,
);

const first_cycle = db.prepare(
  `
  SELECT * 
  FROM cycle_times 
  WHERE machine_id = ?
  ORDER BY exit ASC 
  LIMIT 1
`,
).all(1) as unknown as TCycleTimes[];

const last_cycle = db.prepare(
  `
  SELECT * 
  FROM cycle_times 
  WHERE machine_id = ? 
  ORDER BY id DESC 
  LIMIT 1;
`,
).all(1) as unknown as TCycleTimes[];

const duration = last_cycle[0].exit - first_cycle[0].enter;

const totalSeconds = Math.floor(duration / 1000);
const hours = Math.floor(totalSeconds / 3600);
const minutes = Math.floor((totalSeconds % 3600) / 60);
const seconds = totalSeconds % 60;

console.log(`Run duration: ${hours}h${minutes}m${seconds}s`);

const wasted_time = (1 - (real_ppm / machine_1_ideal_ppm)) * duration;

const totalSeconds2 = Math.floor(wasted_time / 1000);
const hours2 = Math.floor(totalSeconds2 / 3600);
const minutes2 = Math.floor((totalSeconds2 % 3600) / 60);
const seconds2 = totalSeconds2 % 60;

console.log(
  `Wasted time: ${hours2}h${minutes2}m${seconds2}s (${
    ((1 - (real_ppm / machine_1_ideal_ppm)) * 100).toFixed(2)
  }%)`,
);
