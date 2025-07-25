import { Effect } from "effect";
import { DatabaseSync } from "node:sqlite";
import {
  getCyclesSumAndCount,
  getFirstCycle,
  getGap,
  getLastCycle,
} from "./queries.ts";

const new_run: boolean = true;
const clear_old_runs: boolean = false;

const db = new DatabaseSync("test.db");

export type TCycleTimes = {
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
const items_per_stage = [5, 0, 0, 0, 0, 0];

const isItemsToProcessRemaining = () =>
  Effect.gen(function* (_) {
    yield* Effect.yieldNow();
    let total = 0;
    for (let i = 0; i < items_per_stage.length - 1; i++) {
      total += items_per_stage[i];
    }

    return total;
  });

const machine = (id: number, real_cycle_time: number, isLast: boolean) =>
  Effect.gen(function* (_) {
    db.prepare(
      `
	    INSERT OR IGNORE INTO machines (id, ideal_cycle_time) VALUES (?, ?);
    `,
    ).run(id, machines_ideal_cycle_time[id]);

    while (yield* isItemsToProcessRemaining()) {
      if (items_per_stage[id] > 0) {
        const enter = Date.now();
        yield* Effect.log(`Machine ${id} processing part`);
        yield* Effect.sleep(real_cycle_time * 1000);

        while (items_per_stage[id + 1] > 0 && isLast == false) {
          yield* Effect.yieldNow();
        }
        items_per_stage[id]--;
        items_per_stage[id + 1]++;

        const exit = Date.now();
        db.prepare(
          `
	    INSERT INTO cycle_times (machine_id, enter, exit, difference) VALUES (?, ?, ?, ?);
        `,
        ).run(id, enter, exit, exit - enter);

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
      machine(0, machines_ideal_cycle_time[0], false),
      machine(1, machines_ideal_cycle_time[1], false),
      machine(2, machines_ideal_cycle_time[2] * 2, false),
      machine(3, machines_ideal_cycle_time[3], false),
      machine(4, machines_ideal_cycle_time[4], true),
    ], { concurrency: "unbounded" });
  });

function machineStats(id: number, startTime: number) {
  const cycles_sum_count = getCyclesSumAndCount(db, id, startTime);
  const average_cycle_time = cycles_sum_count[0].difference /
    cycles_sum_count[0].cycles;
  // cycle efficiency is ideal cycle time (converted to ms) divided by the actual average cycle time, * 100 to get %
  const cycle_efficiency = ((machines_ideal_cycle_time[0] * 1000) /
    average_cycle_time) * 100;

  console.log(
    `######################################################## Machine ${id}`,
  );
  console.log(
    `Cycle efficiency: ${cycle_efficiency.toFixed(2)}%`,
  );

  const gap = getGap(db, id, startTime);

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
  const first_cycle = getFirstCycle(db, id, startTime);

  // gets the last cycle in the run
  const last_cycle = getLastCycle(db, id);

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

if (new_run) {
  const runStartTime = Date.now();
  await Effect.runPromise(main());
  console.log("done");

  for (let i = 0; i < machines_ideal_cycle_time.length; i++) {
    machineStats(i, runStartTime);
  }
}
