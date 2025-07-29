import {
  AttributeIds,
  ClientMonitoredItem,
  ClientSubscription,
  DataValue,
  MessageSecurityMode,
  MonitoringParametersOptions,
  OPCUAClient,
  ReadValueIdOptions,
  SecurityPolicy,
  TimestampsToReturn,
} from "node-opcua";
import { DatabaseSync } from "node:sqlite";

const client = OPCUAClient.create({
  applicationName: "MyClient",
  connectionStrategy: {
    initialDelay: 1000,
    maxRetry: 5,
  },
  securityMode: MessageSecurityMode.None,
  securityPolicy: SecurityPolicy.None,
  endpointMustExist: false,
});

await client.connect("opc.tcp://debian:4840");

console.log("connected!");

const session = await client.createSession();
console.log("session created!");

const subscription = ClientSubscription.create(session, {
  requestedPublishingInterval: 1000,
  requestedLifetimeCount: 100,
  requestedMaxKeepAliveCount: 10,
  maxNotificationsPerPublish: 100,
  publishingEnabled: true,
  priority: 10,
});

subscription
  .on("started", function () {
    console.log(
      "subscription started for 2 seconds - subscriptionId=",
      subscription.subscriptionId,
    );
  })
  .on("keepalive", function () {
    console.log("keepalive");
  })
  .on("terminated", function () {
    console.log("terminated");
  });

// install monitored item

const itemToMonitor: ReadValueIdOptions = {
  nodeId:
    "ns=4;s=|var|CODESYS Control for Linux SL.Application.PLC_PRG.machine_0_enter",
  attributeId: AttributeIds.Value,
};
const parameters: MonitoringParametersOptions = {
  samplingInterval: 100,
  discardOldest: true,
  queueSize: 10,
};

const monitoredItem = ClientMonitoredItem.create(
  subscription,
  itemToMonitor,
  parameters,
  TimestampsToReturn.Both,
);

const db = new DatabaseSync(":memory:");

db.exec(
  `
	CREATE TABLE IF NOT EXISTS times (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
    time REAL
	) STRICT;
  `,
);

monitoredItem.on("changed", (dataValue: DataValue) => {
  if (dataValue.value.value === true && dataValue.serverTimestamp) {
    db.prepare(
      `
      INSERT INTO times(time) VALUES(?)
    `,
    ).run(dataValue.serverTimestamp.getTime());
    db.prepare(
      `
      DELETE FROM times where time <= ?
      `,
    ).run(dataValue.serverTimestamp.getTime() - 60000);
  }
});

setInterval(() => {
  const first = db.prepare(
    `
  SELECT * 
  FROM times 
  ORDER BY time ASC 
  LIMIT 1
`,
  ).all() as { id: number; time: number }[];

  const last = db.prepare(
    `
  SELECT * 
  FROM times 
  ORDER BY time DESC 
  LIMIT 1
`,
  ).all() as { id: number; time: number }[];

  // console.log(first[0]);
  if (first[0] !== undefined && last[0] !== undefined) {
    const periode = last[0].time - first[0].time;

    const res = db.prepare(
      `
    SELECT COUNT(*) as count
    FROM times
  `,
    ).all() as { count: number }[];

    console.log(res);
    if (res[0] !== undefined) {
      console.log((res[0].count / (periode / 1000)) * 60);
    }
  }
}, 1000);

// await sleep(10000);

// console.log("now terminating subscription");
// await subscription.terminate();
