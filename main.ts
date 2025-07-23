import { Effect } from "effect";

const machines_ideal_cycle_time = [1.6, 1.6, 1.6, 1.6, 1.6];
const machines_parts_to_process = [5, 0, 0, 0, 0];

const isPartsToProcessRemaining = () =>
  Effect.gen(function* (_) {
    yield* Effect.yieldNow();
    return machines_parts_to_process[0] + machines_parts_to_process[1];
  });

const machine = (id: number) =>
  Effect.gen(function* (_) {
    while (yield* isPartsToProcessRemaining()) {
      if (machines_parts_to_process[id] > 0) {
        yield* Effect.log(`Machine ${id} processing part`);
        yield* Effect.sleep(machines_ideal_cycle_time[id] * 1000);

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
    yield* Effect.all([machine(0), machine(1)], { concurrency: "unbounded" });
  });

await Effect.runPromise(main());
console.log("done");
