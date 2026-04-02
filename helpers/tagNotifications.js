const path = require("path");
const axios = require("axios");
const { GoogleAuth } = require("google-auth-library");
const EmployeeModel = require("../Modules/employees/model");
const DeviceModel = require("../Modules/device/model");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "pidilite-cd009";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  __dirname,
  "..",
  "config",
  "serviceAccountKey.json"
);

const resolveServiceAccountPath = () => {
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!envPath) return DEFAULT_SERVICE_ACCOUNT_PATH;
  return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
};

const normalizeTag = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const normalizeSingleTag = (value) => {
  if (Array.isArray(value)) {
    return normalizeTag(value[0] || "");
  }
  return normalizeTag(value);
};

const normalizeTagList = (value) => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(normalizeTag).filter(Boolean)));
  }
  const single = normalizeSingleTag(value);
  return single ? [single] : [];
};

const getAccessToken = async () => {
  const auth = new GoogleAuth({
    keyFile: resolveServiceAccountPath(),
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  const client = await auth.getClient();
  const tokenObj = await client.getAccessToken();
  if (!tokenObj || !tokenObj.token) {
    throw new Error("No access token returned from GoogleAuth");
  }
  return tokenObj.token;
};

const sendPushToToken = async ({ token, title, body, data }) => {
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

  return axios.post(
    url,
    {
      message: {
        token,
        notification: { title, body },
        data,
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
};

const buildNotificationPayload = ({
  eventType,
  narrative,
  employeeName,
  employeeId,
  deviceId,
  timestamp,
}) => {
  const eventLabel = String(eventType || "Activity Event").trim();
  const actorLabel = String(employeeName || employeeId || "Unknown User").trim();
  const detail = String(narrative || "").trim();

  return {
    title: "Activity Alert",
    body: detail
      ? `${actorLabel}: ${eventLabel} - ${detail}`.slice(0, 180)
      : `${actorLabel}: ${eventLabel}`.slice(0, 180),
    data: {
      type: "activity_event",
      event: String(eventType || ""),
      narrative: String(narrative || ""),
      employeeId: String(employeeId || ""),
      employeeName: String(employeeName || ""),
      deviceId: String(deviceId || ""),
      timestamp: String(timestamp || new Date().toISOString()),
    },
  };
};

const resolveTaggedDevices = async ({ location, tags }) => {
  const normalizedLocation = String(location || "").trim();
  const normalizedTags = normalizeTagList(tags);

  const employeeFilter = {
    tag: { $exists: true, $ne: "" },
    status: "Active",
  };
  if (normalizedLocation) {
    employeeFilter.location = normalizedLocation;
  }
  if (normalizedTags.length) {
    employeeFilter.tag = { $in: normalizedTags };
  }

  const taggedEmployees = await EmployeeModel.find(employeeFilter)
    .select("employeeId name tag location")
    .lean();

  if (!taggedEmployees.length) {
    return { taggedEmployees: [], devices: [] };
  }

  const targetEmployeeIds = taggedEmployees
    .map((employee) => String(employee.employeeId || "").trim())
    .filter(Boolean);

  if (!targetEmployeeIds.length) {
    return { taggedEmployees, devices: [], allDevices: [] };
  }

  const allDevices = await DeviceModel.find({
    employeeId: { $in: targetEmployeeIds },
  })
    .select("employeeId deviceId fcmToken verified deviceStatus status")
    .lean();

  const devices = allDevices.filter((device) => {
    const token = String(device?.fcmToken || "").trim();
    return (
      device?.verified !== false &&
      String(device?.deviceStatus || "") !== "Disable" &&
      Boolean(token)
    );
  });

  return { taggedEmployees, devices, allDevices };
};

const sendNotificationToTaggedEmployees = async ({
  location,
  tags,
  title,
  body,
  data = {},
}) => {
  const { taggedEmployees, devices, allDevices } = await resolveTaggedDevices({ location, tags });

  const debug = {
    matchedEmployees: taggedEmployees.length,
    totalDevices: allDevices.length,
    usableDevices: devices.length,
    missingTokenDevices: allDevices.filter((device) => !String(device?.fcmToken || "").trim()).length,
    unverifiedDevices: allDevices.filter((device) => device?.verified === false).length,
    disabledDevices: allDevices.filter((device) => String(device?.deviceStatus || "") === "Disable").length,
    devices: allDevices.map((device) => ({
      employeeId: device.employeeId || "",
      deviceId: device.deviceId || "",
      hasFcmToken: Boolean(String(device?.fcmToken || "").trim()),
      verified: device?.verified !== false,
      deviceStatus: device?.deviceStatus || "",
      status: device?.status || "",
    })),
  };

  if (!taggedEmployees.length) {
    return { recipients: 0, sent: 0, employees: [], debug };
  }

  if (!devices.length) {
    return {
      recipients: taggedEmployees.length,
      sent: 0,
      employees: taggedEmployees.map((employee) => ({
        employeeId: employee.employeeId,
        name: employee.name || "",
        tag: employee.tag || "",
        location: employee.location || "",
      })),
      debug,
    };
  }

  const uniqueTokens = Array.from(
    new Set(devices.map((device) => String(device.fcmToken || "").trim()).filter(Boolean))
  );

  let sent = 0;
  for (const token of uniqueTokens) {
    try {
      await sendPushToToken({
        token,
        title: title || "Test Notification",
        body: body || "This is a tagged test notification.",
        data,
      });
      sent += 1;
    } catch (error) {
      console.warn(
        "Tagged test notification failed:",
        error?.response?.data || error?.message || error
      );
    }
  }

  return {
    recipients: taggedEmployees.length,
    sent,
    employees: taggedEmployees.map((employee) => ({
      employeeId: employee.employeeId,
      name: employee.name || "",
      tag: employee.tag || "",
      location: employee.location || "",
    })),
    debug,
  };
};

const notifyTaggedEmployeesForActivity = async ({
  eventType,
  narrative,
  employeeName,
  employeeId,
  deviceId,
  timestamp,
}) => {
  const taggedEmployees = await EmployeeModel.find({
    tag: { $exists: true, $ne: "" },
    status: "Active",
  })
    .select("employeeId tag")
    .lean();

  if (!taggedEmployees.length) {
    return { recipients: 0, sent: 0 };
  }

  const targetEmployeeIds = taggedEmployees
    .map((employee) => String(employee.employeeId || "").trim())
    .filter(Boolean);

  if (!targetEmployeeIds.length) {
    return { recipients: 0, sent: 0 };
  }

  const devices = await DeviceModel.find({
    employeeId: { $in: targetEmployeeIds },
    verified: { $ne: false },
    deviceStatus: { $ne: "Disable" },
    fcmToken: { $exists: true, $ne: "" },
  })
    .select("employeeId deviceId fcmToken")
    .lean();

  if (!devices.length) {
    return { recipients: targetEmployeeIds.length, sent: 0 };
  }

  const uniqueTokens = Array.from(
    new Set(devices.map((device) => String(device.fcmToken || "").trim()).filter(Boolean))
  );

  if (!uniqueTokens.length) {
    return { recipients: targetEmployeeIds.length, sent: 0 };
  }

  const notification = buildNotificationPayload({
    eventType,
    narrative,
    employeeName,
    employeeId,
    deviceId,
    timestamp,
  });

  let sent = 0;
  for (const token of uniqueTokens) {
    try {
      await sendPushToToken({
        token,
        title: notification.title,
        body: notification.body,
        data: notification.data,
      });
      sent += 1;
    } catch (error) {
      console.warn(
        "Tagged activity notification failed:",
        error?.response?.data || error?.message || error
      );
    }
  }

  return { recipients: targetEmployeeIds.length, sent };
};

module.exports = {
  normalizeSingleTag,
  normalizeTagList,
  notifyTaggedEmployeesForActivity,
  sendNotificationToTaggedEmployees,
};
