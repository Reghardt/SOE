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
import { scale } from "effect/BigDecimal";

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
  requestedPublishingInterval: 100,
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
  samplingInterval: 2,
  discardOldest: true,
  queueSize: 10,
};

const monitoredItem = ClientMonitoredItem.create(
  subscription,
  itemToMonitor,
  parameters,
  TimestampsToReturn.Both,
);

const data: number[] = [];

monitoredItem.on("changed", (dataValue: DataValue) => {
  if (dataValue.value.value === true && dataValue.serverTimestamp) {
    while (
      data.length > 0 && data[0] < dataValue.serverTimestamp.getTime() - 60_000
    ) {
      data.shift();
    }

    data.push(dataValue.serverTimestamp.getTime());

    if (data.length > 1) {
      const start = data[0];
      const end = data.at(-1);
      if (end !== undefined) {
        const duration = end - start;
        const durationInSeconds = duration / 1000;
        console.log((data.length - 1) / (duration / 1000) * 60);
      }
    }
  }
});
