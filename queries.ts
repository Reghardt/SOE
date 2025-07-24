import { type DatabaseSync } from "node:sqlite";
import { TCycleTimes } from "./main.ts";

export function getCyclesSumAndCount(db: DatabaseSync, machine_id: number) {
  return db.prepare(
    `
  select SUM(difference) as difference, COUNT(*) as cycles 
  from cycle_times
  where machine_id = ?;
  `,
  ).all(machine_id) as unknown as { difference: number; cycles: number }[];
}

export function getGap(
  db: DatabaseSync,
  machine_id: number,
  startTime: number,
) {
  return db.prepare(
    `
  WITH cycle_gap AS (
    SELECT 
        id,
        machine_id,
        enter - LAG(exit) OVER (ORDER BY id) as cycle_gap
    FROM cycle_times 
    WHERE machine_id = ? and exit >= ?
  )
  SELECT SUM(cycle_gap) as sum, COUNT(*) as count
  FROM cycle_gap 
  WHERE cycle_gap IS NOT NULL
  ORDER BY id;
  `,
  ).all(machine_id, startTime) as unknown as { sum: number; count: number }[];
}

export function getFirstCycle(db: DatabaseSync, id: number, startTime: number) {
  // gets the first cycle in the run
  return db.prepare(
    `
  SELECT * 
  FROM cycle_times 
  WHERE machine_id = ? and exit >= ?
  ORDER BY exit ASC 
  LIMIT 1
`,
  ).all(id, startTime) as unknown as TCycleTimes[];
}

export function getLastCycle(db: DatabaseSync, id: number) {
  return db.prepare(
    `
      SELECT * 
      FROM cycle_times 
      WHERE machine_id = ? 
      ORDER BY id DESC 
      LIMIT 1;
    `,
  ).all(id) as unknown as TCycleTimes[];
}
