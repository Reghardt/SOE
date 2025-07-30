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

function printConsecutiveDifferences(numbers: number[]) {
  if (numbers.length < 2) {
    console.log(
      "Array must contain at least two numbers to calculate differences.",
    );
    return;
  }

  let sumDifferences = 0;

  console.log("Differences between consecutive numbers:");
  for (let i = 1; i < numbers.length; i++) {
    const diff = numbers[i] - numbers[i - 1];
    console.log(
      `Difference between ${numbers[i]} and ${numbers[i - 1]} is: ${diff}`,
    );
    sumDifferences += diff;
  }

  return sumDifferences;
}

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
  }

  _optimalItemsPerMinute: number;

  _entrySensor: ClientMonitoredItem;

  _entrySensorTimestamps: number[] = [];
  _exitSensorTimestamps: number[] = [];

  startMonitoring() {
    this._entrySensor.on("changed", (dataValue: DataValue) => {
      this.onChange(dataValue);
    });
  }

  stopMonitoring() {
    this._entrySensor.off("changed", (dataValue: DataValue) => {
      this.onChange(dataValue);
    });
  }

  onChange(dataValue: DataValue) {
    if (dataValue.value.value === true && dataValue.sourceTimestamp) {
      while (
        this._entrySensorTimestamps.length > 0 &&
        this._entrySensorTimestamps[0] <
          dataValue.sourceTimestamp.getTime() - 60_000
      ) {
        this._entrySensorTimestamps.shift();
      }

      this._entrySensorTimestamps.push(dataValue.sourceTimestamp.getTime());

      if (this._entrySensorTimestamps.length > 1) {
        const passedPerSecond = getItemsPerSecond(this._entrySensorTimestamps);
        if (passedPerSecond) {
          console.log("items per minute: ", passedPerSecond.toFixed(4));
          console.log(
            `Target: ${
              ((passedPerSecond / this._optimalItemsPerMinute) * 100).toFixed(4)
            }%`,
          );
        }
      }
    }
  }
}

const m0 = new machine(0.5, subscription, {
  itemToMonitor: {
    nodeId:
      "ns=4;s=|var|CODESYS Control for Linux SL.Application.PLC_PRG.machine_0_enter",
    attributeId: AttributeIds.Value,
  },
  monitoringParameters: {
    samplingInterval: 100,
    discardOldest: true,
    queueSize: 10,
  },
}, {
  itemToMonitor: {
    nodeId:
      "ns=4;s=|var|CODESYS Control for Linux SL.Application.PLC_PRG.machine_0_exit",
    attributeId: AttributeIds.Value,
  },
  monitoringParameters: {
    samplingInterval: 100,
    discardOldest: true,
    queueSize: 10,
  },
});

m0.startMonitoring();
