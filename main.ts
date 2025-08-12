import { DatabaseSync } from "node:sqlite";
import { sleep } from "./utils.ts";

//controls
const new_run: boolean = true;
const clear_old_runs: boolean = new_run;

const db = new DatabaseSync("test.db");

db.exec(
  `
	CREATE TABLE IF NOT EXISTS machines (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  ideal_cycle_time REAL
	) STRICT;
  `,
);

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

type TCycleTimes = {
  id: number;
  machine_id: number;
  enter: number;
  exit: number;
  difference: number;
};

const machine_1_ideal_cycle_time = 5 / 3; //1.66666... seconds
const machine_1_ideal_ppm = machine_1_ideal_cycle_time * 60; // 100 ppm

//// Insert statement to create new machine with provided ideal cycle time
// db.prepare(
//   `
// 	INSERT INTO machines (ideal_cycle_time) VALUES (?);
//   `,
// ).run(machine_1_ideal_cycle_time); // 1.6666.. seconds

// deletes old runs or results may be skewed as there can be major time differences between runs
if (clear_old_runs) {
  db.prepare(
    `
    DELETE FROM cycle_times where machine_id = ?;
    `,
  ).run(1);
}

// creates a new run, uses sleep function to simulate machine processing part
if (new_run) {
  for (let i = 0; i < 5; i++) {
    console.log(`Enter part ${i}`);
    const enter = Date.now();
    await sleep(machine_1_ideal_cycle_time * 1000 * 1.3);
    const exit = Date.now();
    console.log(`Exit part ${i}`);
    db.prepare(
      `
	INSERT INTO cycle_times (machine_id, enter, exit, difference) VALUES (?, ?, ?, ?);
  `,
    ).run(1, enter, exit, exit - enter);
    // XXXXXXXXXXXXXXXXXXX // this sleep function simulates a delay between receiving parts
    await sleep(200);
    // XXXXXXXXXXXXXXXXXXX
  }
  console.log("RUN DONE!");
}

//////////////////////////////////////////////////////////////////////////////////// START: Calculations Section

const cycles_sum_count = db.prepare(
  `
  select SUM(difference) as difference, COUNT(*) as cycles from cycle_times
  `,
  // cast generic reuslt to unkown then to the desired type
).all() as unknown as { difference: number; cycles: number }[];

const average_cycle_time = cycles_sum_count[0].difference /
  cycles_sum_count[0].cycles;
// cycle efficiency is ideal cycle time (converted to ms) divided by the actual average cycle time, * 100 to get %
const cycle_efficiency = ((machine_1_ideal_cycle_time * 1000) /
  average_cycle_time) * 100;

console.log(
  `Cycle efficiency: ${cycle_efficiency.toFixed(2)}%`,
);

// gets the gap, the time between a part exiting and the next part entering the machine
const gap = db.prepare(
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

// the sum of all the gap times and the nr of lag times
const average_gap_time = gap[0].sum / gap[0].count; // idle time

// time efficiency = ideal cycle time / (ideal cycle time + average gap time), then convert to %
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

// gets the first cycle in the run
const first_cycle = db.prepare(
  `
  SELECT * 
  FROM cycle_times 
  WHERE machine_id = ?
  ORDER BY exit ASC 
  LIMIT 1
`,
).all(1) as unknown as TCycleTimes[];

// gets the last cycle in the run
const last_cycle = db.prepare(
  `
  SELECT * 
  FROM cycle_times 
  WHERE machine_id = ? 
  ORDER BY id DESC 
  LIMIT 1;
`,
).all(1) as unknown as TCycleTimes[];

// gets duration of run
const duration = last_cycle[0].exit - first_cycle[0].enter;

// duration (UTC ms) to human readable
const totalSeconds = Math.floor(duration / 1000);
const hours = Math.floor(totalSeconds / 3600);
const minutes = Math.floor((totalSeconds % 3600) / 60);
const seconds = totalSeconds % 60;
console.log(`Run duration: ${hours}h${minutes}m${seconds}s`);

// calculate then print wasted time
const wasted_time = (1 - (real_ppm / machine_1_ideal_ppm)) * duration;

// wasted time to human readable
const totalSeconds2 = Math.floor(wasted_time / 1000);
const hours2 = Math.floor(totalSeconds2 / 3600);
const minutes2 = Math.floor((totalSeconds2 % 3600) / 60);
const seconds2 = totalSeconds2 % 60;
console.log(
  `Wasted time: ${hours2}h${minutes2}m${seconds2}s (${
    ((1 - (real_ppm / machine_1_ideal_ppm)) * 100).toFixed(2) // calculates %
  }%)`,
);
