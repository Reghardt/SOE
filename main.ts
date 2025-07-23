import { Effect } from "effect";
import { DatabaseSync } from "node:sqlite";

const new_run: boolean = true;
const clear_old_runs: boolean = new_run;

const db = new DatabaseSync("test.db");

type TCycleTimes = {
  id: number;
  machine_id: number;
  enter: number;
  exit: number;
  difference: number;
};

db.exec(
  `
	CREATE TABLE IF NOT EXISTS machines (
	  id INTEGER UNIQUE,
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

if (clear_old_runs) {
  db.prepare(
    `
    DELETE FROM cycle_times;
    `,
  ).run();
}

const machines_ideal_cycle_time = [5 / 3, 5 / 3, 5 / 3, 5 / 3, 5 / 3];
const machines_ideal_ppm = machines_ideal_cycle_time.map((time) => time * 60);
const machines_parts_to_process = [5, 0, 0, 0, 0];

const isPartsToProcessRemaining = () =>
  Effect.gen(function* (_) {
    yield* Effect.yieldNow();
    return machines_parts_to_process[0] + machines_parts_to_process[1];
  });

const machine = (id: number, real_cycle_time: number) =>
  Effect.gen(function* (_) {
    db.prepare(
      `
	    INSERT OR IGNORE INTO machines (id, ideal_cycle_time) VALUES (?, ?);
    `,
    ).run(id, machines_ideal_cycle_time[id]);

    while (yield* isPartsToProcessRemaining()) {
      if (machines_parts_to_process[id] > 0) {
        const enter = Date.now();
        yield* Effect.log(`Machine ${id} processing part`);
        yield* Effect.sleep(real_cycle_time * 1000);

        const exit = Date.now();
        db.prepare(
          `
	    INSERT INTO cycle_times (machine_id, enter, exit, difference) VALUES (?, ?, ?, ?);
        `,
        ).run(id, enter, exit, exit - enter);

        machines_parts_to_process[id]--;
        machines_parts_to_process[id + 1]++;

        yield* Effect.log(
          `Machine ${id} done processing part`,
        );
      } else {
        yield* Effect.yieldNow();
      }
    }
  });

const main = () =>
  Effect.gen(function* (_) {
    yield* Effect.all([
      machine(0, machines_ideal_cycle_time[0] * 1.5),
      machine(1, machines_ideal_cycle_time[1]),
    ], { concurrency: "unbounded" });
  });

if (new_run) {
  await Effect.runPromise(main());
  console.log("done");
}

function getCyclesSumAndCount(machine_id: number) {
  return db.prepare(
    `
  select SUM(difference) as difference, COUNT(*) as cycles 
  from cycle_times
  where machine_id = ?;
  `,
  ).all(machine_id) as unknown as { difference: number; cycles: number }[];
}

function getGap(machine_id: number) {
  return db.prepare(
    `
  WITH cycle_gap AS (
    SELECT 
        id,
        machine_id,
        enter - LAG(exit) OVER (ORDER BY id) as cycle_gap
    FROM cycle_times 
    WHERE machine_id = ?
  )
  SELECT SUM(cycle_gap) as sum, COUNT(*) as count
  FROM cycle_gap 
  WHERE cycle_gap IS NOT NULL
  ORDER BY id;
  `,
  ).all(machine_id) as unknown as { sum: number; count: number }[];
}

function machineStats(id: number) {
  const cycles_sum_count = getCyclesSumAndCount(id);
  const average_cycle_time = cycles_sum_count[0].difference /
    cycles_sum_count[0].cycles;
  // cycle efficiency is ideal cycle time (converted to ms) divided by the actual average cycle time, * 100 to get %
  const cycle_efficiency = ((machines_ideal_cycle_time[0] * 1000) /
    average_cycle_time) * 100;

  console.log(
    `Cycle efficiency: ${cycle_efficiency.toFixed(2)}%`,
  );

  const gap = getGap(id);

  // the sum of all the gap times and the nr of lag times
  const average_gap_time = gap[0].sum / gap[0].count; // idle time

  // time efficiency = ideal cycle time / (ideal cycle time + average gap time), then convert to %
  const time_efficiency = ((machines_ideal_cycle_time[0] * 1000) /
    ((machines_ideal_cycle_time[0] * 1000) + average_gap_time)) * 100;

  console.log(
    `Time Efficiency: ${
      time_efficiency.toFixed(
        2,
      )
    }%`,
  );

  const real_ppm = (((cycle_efficiency / 100) * machines_ideal_cycle_time[0]) *
    (time_efficiency / 100)) * 60;

  console.log(
    `Ideal ppm: ${machines_ideal_ppm[id].toFixed(2)}, Real ppm: ${
      real_ppm.toFixed(2)
    } (${((real_ppm / machines_ideal_ppm[id]) * 100).toFixed(2)}%)`,
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
  ).all(id) as unknown as TCycleTimes[];

  // gets the last cycle in the run
  const last_cycle = db.prepare(
    `
  SELECT * 
  FROM cycle_times 
  WHERE machine_id = ? 
  ORDER BY id DESC 
  LIMIT 1;
`,
  ).all(id) as unknown as TCycleTimes[];

  // gets duration of run
  const duration = last_cycle[0].exit - first_cycle[0].enter;

  // duration (UTC ms) to human readable
  const totalSeconds = Math.floor(duration / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  console.log(`Run duration: ${hours}h${minutes}m${seconds}s`);

  // calculate then print wasted time
  const wasted_time = (1 - (real_ppm / machines_ideal_ppm[id])) * duration;

  // wasted time to human readable
  const totalSeconds2 = Math.floor(wasted_time / 1000);
  const hours2 = Math.floor(totalSeconds2 / 3600);
  const minutes2 = Math.floor((totalSeconds2 % 3600) / 60);
  const seconds2 = totalSeconds2 % 60;
  console.log(
    `Wasted time: ${hours2}h${minutes2}m${seconds2}s (${
      ((1 - (real_ppm / machines_ideal_ppm[id])) * 100).toFixed(2) // calculates %
    }%)`,
  );
}

machineStats(0);
machineStats(1);
