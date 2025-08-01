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

const client = OPCUAClient.create({
  applicationName: "MyClient",
  connectionStrategy: {
    initialDelay: 0,
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
  requestedPublishingInterval: 5000,
  requestedLifetimeCount: 100,
  requestedMaxKeepAliveCount: 10,
  maxNotificationsPerPublish: 0,
  publishingEnabled: true,
  priority: 10,
});

subscription
  .on("started", function () {
    console.log(
      "subscription started: ",
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

/**
 * @description From an array of UTC timestamps, return the rate of timestamps per second
 * @param timestampsUTC, array of UTC time readings
 * @returns items per second
 */
function getItemsPerSecond(timestampsUTC: number[]) {
  // wait for more than 4 data points
  if (timestampsUTC.length < 4) {
    return;
  }

  // difference accumulator
  let sumDifferences = 0;

  // ignore first 3 readings to discard first reading after connection which comes in to fast
  for (let i = 3; i < timestampsUTC.length; i++) {
    const diff = timestampsUTC[i] - timestampsUTC[i - 1];
    sumDifferences += diff;
  }

  // ignore first 3 readings in array again
  // convert to items per second
  return 1000 / (sumDifferences / (timestampsUTC.length - 3));
}

class machine {
  constructor(
    optimalItemsPerMinute: number,
    subscription: ClientSubscription,
    enter: {
      itemToMonitor: ReadValueIdOptions;
      monitoringParameters: MonitoringParametersOptions;
    },
    exit: {
      itemToMonitor: ReadValueIdOptions;
      monitoringParameters: MonitoringParametersOptions;
    },
  ) {
    this._optimalItemsPerMinute = optimalItemsPerMinute;

    this._entrySensor = ClientMonitoredItem.create(
      subscription,
      enter.itemToMonitor,
      enter.monitoringParameters,
      TimestampsToReturn.Both,
    );

    this._exitSensor = ClientMonitoredItem.create(
      subscription,
      exit.itemToMonitor,
      exit.monitoringParameters,
      TimestampsToReturn.Both,
    );
  }

  _optimalItemsPerMinute: number;

  _entrySensor: ClientMonitoredItem;
  _exitSensor: ClientMonitoredItem;

  _entrySensorTimestamps: number[] = [];
  _exitSensorTimestamps: number[] = [];

  startMonitoring() {
    this._entrySensor.on("changed", (dataValue: DataValue) => {
      this.onTrigger(dataValue, this._entrySensorTimestamps);
    });

    this._exitSensor.on("changed", (dataValue: DataValue) => {
      this.onTrigger(dataValue, this._exitSensorTimestamps);
    });
  }

  stopMonitoring() {
    this._entrySensor.off("changed", (dataValue: DataValue) => {
      this.onTrigger(dataValue, this._entrySensorTimestamps);
    });

    this._exitSensor.off("changed", (dataValue: DataValue) => {
      this.onTrigger(dataValue, this._exitSensorTimestamps);
    });
  }

  onTrigger(dataValue: DataValue, timestamps: number[]) {
    if (dataValue.value.value === true && dataValue.sourceTimestamp) {
      // console.log("t", dataValue.sourceTimestamp);
      while (
        timestamps.length > 0 &&
        timestamps[0] <
          dataValue.sourceTimestamp.getTime() - 60_000
      ) {
        timestamps.shift();
      }

      timestamps.push(dataValue.sourceTimestamp.getTime());

      const passedPerSecond = getItemsPerSecond(timestamps);
      if (passedPerSecond) {
        // console.log("items per minute: ", passedPerSecond.toFixed(4));
        console.log(
          `Input: ${
            ((passedPerSecond / this._optimalItemsPerMinute) * 100).toFixed(4)
          }%`,
        );
      }
    } else {
      // console.log("f", dataValue.sourceTimestamp);
    }
  }
}

const m0 = new machine(1, subscription, {
  itemToMonitor: {
    nodeId:
      "ns=4;s=|var|CODESYS Control for Linux SL.Application.PLC_PRG.machine_0_enter",
    attributeId: AttributeIds.Value,
  },
  monitoringParameters: {
    samplingInterval: 50,
    discardOldest: true,
    queueSize: 20,
  },
}, {
  itemToMonitor: {
    nodeId:
      "ns=4;s=|var|CODESYS Control for Linux SL.Application.PLC_PRG.machine_0_exit",
    attributeId: AttributeIds.Value,
  },
  monitoringParameters: {
    samplingInterval: 50,
    discardOldest: true,
    queueSize: 20,
  },
});

m0.startMonitoring();
