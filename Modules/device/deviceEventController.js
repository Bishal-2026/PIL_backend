const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
const { GoogleAuth } = require("google-auth-library");
const DeviceEvent = require("./deviceEventModel");
const DeviceModel = require("./model");
const UserModel = require("../user/model");
const UserSession = require("../user/userSessionsModel");
const EmployeeModel = require("../employees/model");
const VisitorModel = require("../user/visitorModel");
const { notifyTaggedEmployeesForActivity } = require("../../helpers/tagNotifications");
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "pidilite-cd009";
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  __dirname,
  "..",
  "..",
  "config",
  "serviceAccountKey.json"
);

const resolveServiceAccountPath = () => {
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!envPath) return DEFAULT_SERVICE_ACCOUNT_PATH;
  return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
};
const normalizeDeviceId = (value) => String(value || "").trim();
const resolveActivityCategory = (eventType) => {
  const value = String(eventType || "").toLowerCase();
  if (value.includes("accessibility")) return "app_install";
  if (value.includes("camera")) return "camera";
  if (value.includes("screenshot")) return "screenshot";
  if (value.includes("video")) return "video";
  return "other";
};

const isCameraEvent = (eventType) =>
  /camera|screenshot|video/i.test(String(eventType || ""));

const isAppAccessEvent = (...values) => {
  const text = values
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");
  if (!text) return false;
  return (
    text.includes("app access") ||
    text.includes("restricted app opened") ||
    text.includes("youtube") ||
    text.includes("whatsapp") ||
    text.includes("instagram") ||
    text.includes("facebook")
  );
};

const isAppInstallEvent = (...values) => {
  const text = values
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");
  if (!text) return false;
  return (
    text.includes("app_install") ||
    text.includes("app install") ||
    text.includes("restricted settings") ||
    text.includes("user has opened restricted settings of app") ||
    text.includes("user has opened restricted settings of application")
  );
};

const isRestrictedSettingsEvent = (...values) => {
  const text = values
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");
  if (!text) return false;
  return (
    text.includes("restricted settings") ||
    text.includes("user has opened restricted settings of app") ||
    text.includes("user has opened restricted settings of application")
  );
};

const resolveUserSessionStatus = async ({ userId, employeeId }) => {
  const sessionFilters = [];
  if (userId && mongoose.isValidObjectId(userId)) {
    sessionFilters.push({ userId });
  }
  if (employeeId) {
    sessionFilters.push({ employeeId });
  }
  if (sessionFilters.length) {
    const session = await UserSession.findOne({
      $or: sessionFilters,
    })
      .sort({ createdAt: -1, _id: -1 })
      .select("action")
      .lean();
    if (session) return session.action;
  }
  if (userId && mongoose.isValidObjectId(userId)) {
    const user = await UserModel.findById(userId)
      .select("sessionStatus")
      .lean();
    if (user) return user.sessionStatus;
  }
  if (employeeId) {
    const user = await UserModel.findOne({ employeeId })
      .select("sessionStatus")
      .lean();
    if (user) return user.sessionStatus;
  }
  if (userId && mongoose.isValidObjectId(userId)) {
    const visitor = await VisitorModel.findById(userId)
      .select("sessionStatus")
      .lean();
    if (visitor) return visitor.sessionStatus;
  }
  if (employeeId) {
    const visitor = await VisitorModel.findOne({ employeeId })
      .select("sessionStatus")
      .lean();
    if (visitor) return visitor.sessionStatus;
  }
  return null;
};

const shouldIgnoreEventWhenLoggedOut = ({ event, metadata, narrative }) => {
  if (
    isRestrictedSettingsEvent(
      event,
      narrative,
      metadata?.event,
      metadata?.narrative
    )
  ) {
    return false;
  }

  const blockedByType = isCameraEvent(event);
  const blockedByAccess = isAppAccessEvent(
    event,
    narrative,
    metadata?.appName,
    metadata?.packageName,
    metadata?.app,
    metadata?.event,
    metadata?.narrative
  );
  return blockedByType || blockedByAccess;
};

const parseDurationSeconds = (...candidates) => {
  const joined = candidates
    .filter(Boolean)
    .map((value) => String(value))
    .join(" ");
  if (!joined) return null;
  const text = joined.toLowerCase();
  const match = text.match(/used\s*for\s*(\d+(?:\.\d+)?)\s*(?:sec|secs|second|seconds)\b/);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
};

const isPermissionDisabledEvent = (textValue) => {
  const value = String(textValue || "").toLowerCase();
  const isDisabled =
    /\bdisabled\b/i.test(value) ||
    /turned\s*off/i.test(value) ||
    /turn\s*off/i.test(value) ||
    /\boff\b/i.test(value);
  if (!isDisabled) return false;
  return (
    value.includes("overlay") ||
    value.includes("location permission") ||
    value.includes("notification permission") ||
    value.includes("device admin") ||
    value.includes("accessibility") ||
    value.includes("usage access")
  );
};

const isVideoCallContext = (textValue) => {
  const value = String(textValue || "").toLowerCase();
  return (
    value.includes("video call") ||
    value.includes("videocall") ||
    value.includes("whatsapp") ||
    value.includes("instagram") ||
    value.includes("facebook")
  );
};

const resolvePolicyVoilation = async ({
  eventType,
  userId,
  employeeId,
  metadata,
  narrative,
  raw,
}) => {
  const parts = [
    eventType,
    narrative,
    metadata?.appName,
    metadata?.packageName,
    metadata?.app,
    metadata?.event,
    metadata?.narrative,
    raw?.appName,
    raw?.packageName,
    raw?.app,
    raw?.event,
    raw?.narrative,
  ];
  const value = parts
    .filter(Boolean)
    .map((item) => String(item).trim().toLowerCase())
    .join(" ");

  // Rule 1: Policy violation ONLY for permission-disable type events.
  if (isPermissionDisabledEvent(value)) return true;

  // Rule 2: Policy violation ONLY when user is Logged In AND camera usage > 3 sec AND (video call context).
  if (!isCameraEvent(eventType)) return false;
  const seconds = parseDurationSeconds(narrative, metadata?.narrative, raw?.narrative, eventType);
  if (!seconds || seconds <= 3) return false;
  if (!isVideoCallContext(value)) return false;
  const status = await resolveUserSessionStatus({ userId, employeeId });
  return status === "Logged In";
};

const resolveActorName = async ({ userId, employeeId, fallbackName }) => {
  if (employeeId) {
    const employee = await EmployeeModel.findOne({ employeeId }).lean();
    if (employee?.name) return employee.name;
    const visitor = await VisitorModel.findOne({ employeeId }).lean();
    if (visitor?.name) return visitor.name;
  }

  if (userId && mongoose.isValidObjectId(userId)) {
    const user = await UserModel.findById(userId).lean();
    if (user?.name) return user.name;
  }

  return fallbackName || "";
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

const sendAdminNotification = async (
  device,
  eventType,
  cameraStatus,
  name,
  employeeId,
  imagePath
) => {
  if (!device?.fcmToken) {
    return;
  }

  const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
  const message = {
    message: {
      token: device.fcmToken,
      notification: {
        title: "Camera Event Detected",
        body: `Event ${eventType} on ${name || device.ownerName || device.deviceId}`,
      },
      data: {
        event: eventType,
        cameraStatus: cameraStatus || "unknown",
        deviceId: String(device._id || ""),
        name: name || "",
        employee_id: employeeId || "",
        imagePath: imagePath || "",
      },
    },
  };

  const accessToken = await getAccessToken();
  await axios.post(url, message, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
};

const resolveDeviceById = async (deviceId) => {
  if (!deviceId) return null;
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const deviceQuery = {
    $or: [{ deviceId: new RegExp(`^${normalizedDeviceId}$`, "i") }],
  };
  if (mongoose.isValidObjectId(deviceId)) {
    deviceQuery.$or.push({ _id: deviceId });
  }
  return DeviceModel.findOne(deviceQuery);
};

// Save device event (camera opened, etc.)
exports.storeEvent = async (req, res) => {
  try {
    const {
      deviceId,
      event,
      timestamp,
      cameraStatus,
      name,
      employeeId,
      employee_id,
      imagePath,
      codeId,
      metadata,
      narrative,
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ status: false, message: "deviceId is required" });
    }
    if (!event) {
      return res.status(400).json({ status: false, message: "event is required" });
    }

    const device = await resolveDeviceById(deviceId);
    if (!device) {
      return res.status(404).json({ status: false, message: "Device not found" });
    }

    if (
      device.devicePolicyState?.uninstallBlocked !== true &&
      !isAppInstallEvent(event, narrative, metadata?.event, metadata?.narrative)
    ) {
      return res.status(200).json({
        status: true,
        skipped: true,
        message: "Event ignored because uninstallBlocked is false",
      });
    }

    const resolvedEmployeeId = employeeId || employee_id || device.employeeId || "";
    const sessionStatus = await resolveUserSessionStatus({
      userId: device.userId,
      employeeId: resolvedEmployeeId,
    });
    if (
      sessionStatus !== "Logged In" &&
      shouldIgnoreEventWhenLoggedOut({ event, metadata, narrative })
    ) {
      return res.status(200).json({
        status: true,
        skipped: true,
        message: "Event ignored because user is logged out",
      });
    }

    let policyVoilation = await resolvePolicyVoilation({
      eventType: event,
      userId: device.userId,
      employeeId: resolvedEmployeeId,
      metadata,
      narrative,
      raw: req.body,
    });
    console.log("device-event policy check", {
      event,
      narrative,
      finalPolicyVoilation: policyVoilation,
    });

    const normalizedTimestamp = timestamp
      ? new Date(String(timestamp).replace(/(\.\d{3})\d+/, "$1"))
      : new Date();

    if (timestamp && isNaN(normalizedTimestamp.getTime())) {
      return res.status(400).json({ status: false, message: "timestamp is invalid" });
    }

    const savedEvent = await DeviceEvent.create({
      deviceId: device._id,
      event,
      cameraStatus,
      imagePath,
      name,
      employeeId: resolvedEmployeeId,
      codeId,
      policyVoilation,
      narrative,
      timestamp: normalizedTimestamp,
      metadata: {
        ...(metadata || {}),
        ...(narrative ? { narrative } : {}),
      },
      raw: req.body,
    });

    const actorName = await resolveActorName({
      userId: device.userId,
      employeeId: employeeId || employee_id || device.employeeId,
      fallbackName: name || device.ownerName,
    });

    const resolvedImagePath =
      imagePath || metadata?.imagePath || req.body?.imagePath || "";

    try {
      await sendAdminNotification(
        device,
        event,
        cameraStatus,
        name,
        employeeId || employee_id,
        imagePath
      );
    } catch (notifyError) {
      console.warn("⚠️ Device event notification failed:", notifyError.message);
    }

    try {
      await notifyTaggedEmployeesForActivity({
        eventType: event,
        narrative,
        employeeName: actorName || name,
        employeeId: resolvedEmployeeId,
        deviceId: device.deviceId || device._id,
        timestamp: normalizedTimestamp,
      });
    } catch (tagNotifyError) {
      console.warn("⚠️ Tagged activity notification failed:", tagNotifyError.message);
    }

    return res.status(200).json({
      status: true,
      message: "Event saved successfully",
      data: savedEvent,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Latest screenshot event for a device
exports.getLatestScreenshot = async (req, res) => {
  try {
    const { deviceId } = req.query || {};
    if (!deviceId) {
      return res.status(400).json({ status: false, message: "deviceId is required" });
    }

    const device = await resolveDeviceById(deviceId);
    if (!device) {
      return res.status(404).json({ status: false, message: "Device not found" });
    }

    const event = await DeviceEvent.findOne({
      deviceId: device._id,
      imagePath: { $exists: true, $ne: "" },
      event: { $regex: "screenshot|camera", $options: "i" },
    })
      .sort({ timestamp: -1 })
      .lean();

    if (!event) {
      return res.status(200).json({ status: true, data: null });
    }

    return res.status(200).json({
      status: true,
      data: {
        timestamp: event.timestamp,
        imagePath: event.imagePath,
        deviceId: event.raw?.deviceId || device.deviceId || device._id,
      },
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
