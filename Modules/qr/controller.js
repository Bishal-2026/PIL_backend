const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");
const qrcode = require("qrcode");
const crypto = require("crypto");
const User = require("../user/model");
const DeviceModel = require("../device/model");
const UserSession = require("../user/userSessionsModel");
const EmployeeModel = require("../employees/model");
const SettingsModel = require("../settings/model");
const VisitorModel = require("../user/visitorModel");
const { markAttendance } = require("../../helpers/attendance");
const { resolveLocationByNameOrAlias } = require("../location/resolver");

const JWT_SECRET =
  process.env.SECRET_KEY ||
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET;

const STATIC_QR_LOGIN_TOKEN = String(process.env.STATIC_QR_LOGIN_TOKEN || "").trim();
const STATIC_QR_LOGOUT_TOKEN = String(process.env.STATIC_QR_LOGOUT_TOKEN || "").trim();

const normalizeLocation = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim().toLowerCase();
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return String(value);
  }
};

const normalizeDeviceId = (value) =>
  String(value || "").trim().toLowerCase();

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildPolicyStateForAction = (currentState = {}, action) => {
  const nextState = { ...currentState };
  const isLogin = action === "login";
  const isLogout = action === "logout";

  Object.keys(nextState).forEach((key) => {
    if (typeof nextState[key] !== "boolean") return;
    if (isLogin) {
      nextState[key] = true;
      return;
    }
    if (isLogout) {
      nextState[key] = key === "uninstallBlocked" ? true : false;
    }
  });

  return nextState;
};

const normalizePolicyUpdate = (payload) => {
  if (!payload || typeof payload !== "object") {
    return { policyUpdate: null, locationAllowed: undefined };
  }

  const source =
    payload.devicePolicyState && typeof payload.devicePolicyState === "object"
      ? payload.devicePolicyState
      : payload;

  const policyKeys = [
    "cameraDisabled",
    "uninstallBlocked",
    "facebookBlocked",
    "instagramBlocked",
    "youtubeBlocked",
    "whatsappBlocked",
    "kioskMode",
    "allowedApps",
    "blockedApps",
  ];

  const policyUpdate = {};
  policyKeys.forEach((key) => {
    if (source[key] === undefined) return;
    if (key === "allowedApps" || key === "blockedApps") {
      if (Array.isArray(source[key])) {
        policyUpdate[key] = source[key];
      }
      return;
    }
    if (typeof source[key] === "boolean") {
      policyUpdate[key] = source[key];
    }
  });

  const locationAllowed =
    typeof payload.locationAllowed === "boolean"
      ? payload.locationAllowed
      : undefined;

  return {
    policyUpdate: Object.keys(policyUpdate).length ? policyUpdate : null,
    locationAllowed,
  };
};

const resolveUserLocation = async (user) => {
  const directLocation = user?.location;
  if (directLocation) {
    return directLocation;
  }

  if (!user?._id) {
    return "";
  }

  const employee = await EmployeeModel.findOne({ userId: user._id }).lean();
  return employee?.location || "";
};

const resolveAssignedDeviceId = async (user, requestedDeviceId) => {
  const provided = String(requestedDeviceId || "").trim();
  const stored = String(user.deviceId || "").trim();

  if (!provided && !stored) {
    return { error: "deviceId is required" };
  }

  const normalizedProvided = normalizeDeviceId(provided);
  const normalizedStored = normalizeDeviceId(stored);
  const employeeId = String(user.employeeId || "").trim();

  const buildAssignmentQuery = (value) => {
    const regex = new RegExp(`^${escapeRegExp(value)}$`, "i");
    const orFilters = [{ userId: user._id }];
    if (employeeId) {
      orFilters.push({ employeeId });
    }
    return {
      deviceId: { $regex: regex },
      deviceStatus: { $ne: "Disable" },
      $or: orFilters,
    };
  };

  if (stored) {
    if (provided && normalizedProvided !== normalizedStored) {
      const assignedDevice = await DeviceModel.findOne(
        buildAssignmentQuery(provided)
      );
      if (!assignedDevice) {
        return { error: "Device is not assigned to this user" };
      }
      return {
        deviceId: assignedDevice.deviceId,
        syncDeviceId: assignedDevice.deviceId,
      };
    }
    return { deviceId: stored };
  }

  if (!provided) {
    return { error: "deviceId is required" };
  }

  const assignedDevice = await DeviceModel.findOne(
    buildAssignmentQuery(provided)
  );
  if (!assignedDevice) {
    return { error: "Device is not assigned to this user" };
  }
  return {
    deviceId: assignedDevice.deviceId,
    syncDeviceId: assignedDevice.deviceId,
  };
};


const createQrToken = async (payload) => {
  const action = String(payload.action || "").toLowerCase();
  const location = payload.location;
  const expiresIn = payload.expiresIn;
  const expiresAt = payload.expiresAt;

  if (!["login", "logout"].includes(action)) {
    const error = new Error("action must be login or logout");
    error.status = 400;
    throw error;
  }
  if (location === undefined || location === null || location === "") {
    const error = new Error("location is required");
    error.status = 400;
    throw error;
  }

  let expirationMs = 5 * 60 * 1000;
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (isNaN(parsed.getTime())) {
      const error = new Error("expiresAt is invalid");
      error.status = 400;
      throw error;
    }
    expirationMs = parsed.getTime() - Date.now();
    if (expirationMs <= 0) {
      const error = new Error("expiresAt must be in the future");
      error.status = 400;
      throw error;
    }
  } else if (expiresIn !== undefined) {
    const seconds = Number(expiresIn);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      const error = new Error("expiresIn must be a positive number of seconds");
      error.status = 400;
      throw error;
    }
    expirationMs = seconds * 1000;
  } else {
    const settings = await SettingsModel.findOne().lean();
    const fallbackSeconds = Number(settings?.qrExpirySeconds);
    if (Number.isFinite(fallbackSeconds) && fallbackSeconds > 0) {
      expirationMs = fallbackSeconds * 1000;
    }
  }

  const tokenId = randomUUID();
  const token = jwt.sign(
    { jti: tokenId, action, location },
    JWT_SECRET,
    { expiresIn: Math.floor(expirationMs / 1000) }
  );

  const expiresAtDate = new Date(Date.now() + expirationMs);
  return { token, expiresAt: expiresAtDate, action, location, reused: false };
};

exports.generateQr = async (req, res) => {
  try {
    const location = await resolveUserLocation(req.user);
    if (!location) {
      return res.status(400).json({ message: "location missing for user" });
    }

    const { token, expiresAt, action, reused } = await createQrToken({
      ...req.body,
      location,
    });

    return res.status(201).json({
      message: "QR generated successfully",
      token,
      expiresAt,
      action,
      location,
      reused,
    });
  } catch (error) {
    console.error("QR Generate Error:", error);
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error", error: error.message });
  }
};

exports.getOfflineSecret = async (req, res) => {
  try {
    const location = await resolveUserLocation(req.user);
    if (!location) {
      return res.status(400).json({ message: "location missing for user" });
    }

    // Derive a unique secret for this location specifically for offline QR generation
    const normalizedLocation = normalizeLocation(location);
    const offlineSecret = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`offline-qr-${normalizedLocation}`)
      .digest("hex");

    return res.status(200).json({
      message: "Offline secret generated successfully",
      offlineSecret,
      location,
    });
  } catch (error) {
    console.error("Get Offline Secret Error:", error);
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error", error: error.message });
  }
};

exports.generateQrPng = async (req, res) => {
  try {
    const location = await resolveUserLocation(req.user);
    if (!location) {
      return res.status(400).json({ message: "location missing for user" });
    }

    const { token, expiresAt, action, reused } = await createQrToken({
      ...req.body,
      location,
    });
    const pngBuffer = await qrcode.toBuffer(token, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 480,
    });

    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers":
        "X-QR-Token, X-QR-Expires-At, X-QR-Action, X-QR-Location, X-QR-Reused",
      "X-QR-Token": token,
      "X-QR-Expires-At": expiresAt.toISOString(),
      "X-QR-Action": action,
      "X-QR-Location": String(location),
      "X-QR-Reused": String(reused),
    });
    return res.status(200).send(pngBuffer);
  } catch (error) {
    console.error("QR PNG Error:", error);
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error", error: error.message });
  }
};

exports.generateStaticQrPng = async (req, res) => {
  try {
    const type = String(req.query.type || "").toLowerCase();
    if (!["login", "logout"].includes(type)) {
      return res.status(400).json({ message: "type must be login or logout" });
    }

    const token =
      type === "login" ? STATIC_QR_LOGIN_TOKEN : STATIC_QR_LOGOUT_TOKEN;
    if (!token) {
      return res.status(400).json({ message: "Static QR token not configured" });
    }

    const requestedSize = Number(req.query.size);
    const width =
      Number.isFinite(requestedSize) && requestedSize > 0
        ? Math.min(Math.max(requestedSize, 128), 1024)
        : 480;

    const pngBuffer = await qrcode.toBuffer(token, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width,
    });

    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": "X-QR-Type",
      "X-QR-Type": type,
    });
    return res.status(200).send(pngBuffer);
  } catch (error) {
    console.error("QR Static PNG Error:", error);
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Server error", error: error.message });
  }
};

exports.consumeQr = async (req, res) => {
  const {
    token,
    userId,
    deviceId,
    location,
    deviceLocation,
    employeeId,
    action: actionBody,
  } = req.body;

  try {
    if (!token) {
      return res.status(400).json({ message: "token is required" });
    }
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "userId must be a valid user id" });
    }
    const isStaticLoginToken =
      STATIC_QR_LOGIN_TOKEN && token === STATIC_QR_LOGIN_TOKEN;
    const isStaticLogoutToken =
      STATIC_QR_LOGOUT_TOKEN && token === STATIC_QR_LOGOUT_TOKEN;
    const usingStaticToken = isStaticLoginToken || isStaticLogoutToken;
    let resolvedLocation = location;
    if (!usingStaticToken && (location === undefined || location === null || location === "")) {
      return res.status(400).json({ message: "location is required" });
    }
    if (
      usingStaticToken &&
      (resolvedLocation === undefined || resolvedLocation === null || resolvedLocation === "")
    ) {
      resolvedLocation = "static";
    }

    let tokenId = null;
    let action = "";
    let tokenLocation = null;
    let expMs = null;
    let isOfflineToken = false;
    let resolvedLocationId = null;
    if (usingStaticToken) {
      if (isStaticLoginToken) {
        action = "login";
      } else if (isStaticLogoutToken) {
        action = "logout";
      }
      if (!["login", "logout"].includes(action)) {
        return res.status(400).json({ message: "action must be login or logout" });
      }
    } else {
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        // Try the offline location-specific secret(s).
        // Decode payload without verification to read `location` (do not trust it; only for picking secret candidates).
        const unverified = jwt.decode(token) || {};
        const secretCandidates = [];
        if (unverified?.location !== undefined && unverified?.location !== null) {
          secretCandidates.push(unverified.location);
        }
        secretCandidates.push(resolvedLocation);

        let verified = null;
        for (const candidate of secretCandidates) {
          try {
            const normalizedCandidate = normalizeLocation(candidate);
            if (!normalizedCandidate) continue;
            const offlineSecret = crypto
              .createHmac("sha256", JWT_SECRET)
              .update(`offline-qr-${normalizedCandidate}`)
              .digest("hex");
            verified = jwt.verify(token, offlineSecret);
            isOfflineToken = true;
            break;
          } catch (_offlineErr) {
            // continue
          }
        }

        if (!verified) {
          throw err; // Throw the original error if both fail
        }
        decoded = verified;
      }

      tokenId = decoded.jti;
      action = String(decoded.action || "").toLowerCase();
      tokenLocation = decoded.location;

      if (!tokenId) {
        return res.status(400).json({ message: "tokenId missing in token" });
      }
      if (!["login", "logout"].includes(action)) {
        return res.status(400).json({ message: "token action is invalid" });
      }

      expMs = decoded?.exp ? decoded.exp * 1000 : null;
      if (expMs && expMs < Date.now()) {
        return res.status(400).json({ message: "QR expired" });
      }

      // Location match: prefer comparing Location _id (supports renamed locations via aliases),
      // but fall back to string compare for legacy/unmapped locations.
      const tokenLocRecord = await resolveLocationByNameOrAlias({ location: tokenLocation });
      const requestLocRecord = await resolveLocationByNameOrAlias({ location: resolvedLocation });
      if (tokenLocRecord && requestLocRecord) {
        if (String(tokenLocRecord._id) !== String(requestLocRecord._id)) {
          return res.status(400).json({ message: "Location does not match QR" });
        }
        resolvedLocation = String(requestLocRecord.name || resolvedLocation).trim();
        resolvedLocationId = requestLocRecord._id;
      } else {
        const normalizedTokenLocation = normalizeLocation(tokenLocation);
        const normalizedRequestLocation = normalizeLocation(resolvedLocation);
        if (normalizedTokenLocation !== normalizedRequestLocation) {
          return res.status(400).json({ message: "Location does not match QR" });
        }
        if (requestLocRecord) {
          resolvedLocation = String(requestLocRecord.name || resolvedLocation).trim();
          resolvedLocationId = requestLocRecord._id;
        }
      }
    }

    // Resolve user/employee: accept userId as User _id or Employee _id/employeeId/userId
    let user = null;
    let employee = null;
    let visitor = null;
    let isVisitor = false;

    user = await User.findById(userId);
    if (!user) {
      employee =
        (await EmployeeModel.findById(userId)) ||
        (await EmployeeModel.findOne({ userId }));
    }
    if (!user && employee?.userId) {
      user = await User.findById(employee.userId);
    }
    if (!employee && user?.employeeId) {
      employee = await EmployeeModel.findOne({ employeeId: user.employeeId });
    }

    if (!employee && !user) {
      visitor =
        (await VisitorModel.findById(userId)) ||
        (await VisitorModel.findOne({ employeeId: userId })) ||
        (employeeId ? await VisitorModel.findOne({ employeeId }) : null) ||
        (deviceId ? await VisitorModel.findOne({ deviceId }) : null);
      if (visitor) {
        isVisitor = true;
        employee = {
          employeeId: visitor.employeeId || String(visitor._id),
          rfid: visitor.rfid || `VISITOR-${visitor.employeeId || visitor._id}`,
          section: "Visitor",
          userId: null,
        };
      }
    }

    if (!employee && !user && !visitor) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    let sessionDeviceId = deviceId;
    if (user || visitor) {
      const resolved = await resolveAssignedDeviceId(user || visitor, deviceId);
      if (resolved.error) {
        return res.status(400).json({ message: resolved.error });
      }
      sessionDeviceId = resolved.deviceId;
      if (resolved.syncDeviceId) {
        if (user) {
          await User.findByIdAndUpdate(user._id, {
            deviceId: resolved.syncDeviceId,
          });
        }
      }
    }

    if (
      action === "login" &&
      (user?.sessionStatus === "Logged In" ||
        visitor?.sessionStatus === "Logged In")
    ) {
      return res.status(400).json({
        message: "User is already Logged In ",
      });
    }
    if (
      action === "logout" &&
      (user?.sessionStatus === "Logout" || visitor?.sessionStatus === "Logout")
    ) {
      return res.status(400).json({ message: "User is already logged out" });
    }

    if (!employee.rfid || !employee.section) {
      return res
        .status(400)
        .json({ message: "Employee RFID/section missing for attendance" });
    }
    if (!resolvedLocationId && resolvedLocation && resolvedLocation !== "static") {
      const requestLocRecord = await resolveLocationByNameOrAlias({ location: resolvedLocation });
      if (requestLocRecord) {
        resolvedLocation = String(requestLocRecord.name || resolvedLocation).trim();
        resolvedLocationId = requestLocRecord._id;
      }
    }

    await markAttendance(
      employee,
      action,
      user?._id || visitor?._id,
      resolvedLocation,
      resolvedLocationId
    );

    const sessionAction = action === "login" ? "Logged In" : "Logout";
    const sessionUserId = employee?.userId || user?._id || visitor?._id || employee._id;
    const rawPayload = { ...req.body };
    delete rawPayload.token;
    delete rawPayload.userId;
    delete rawPayload.deviceId;
    delete rawPayload.employeeId;
    delete rawPayload.action;
    delete rawPayload.location;
    delete rawPayload.deviceLocation;

    await UserSession.create({
      userId: sessionUserId,
      deviceId: sessionDeviceId,
      employeeId: employee.employeeId,
      action: sessionAction,
      token,
      location: resolvedLocation,
      locationId: resolvedLocationId,
      deviceLocation,
      raw: rawPayload,
    });
    if (deviceLocation !== undefined) {
      await DeviceModel.updateOne(
        { deviceId: sessionDeviceId },
        { $set: { deviceLocation } }
      );
    }
    if (user) {
      await User.findByIdAndUpdate(user._id, {
        sessionStatus: sessionAction,
      });
    }
    if (visitor) {
      await VisitorModel.findByIdAndUpdate(visitor._id, {
        sessionStatus: sessionAction,
      });
    }

    if (sessionDeviceId) {
      const payloadSettings =
        req.body?.devicePolicyState || req.body?.deviceSettings;
      const { policyUpdate, locationAllowed } =
        normalizePolicyUpdate(payloadSettings);
      if (policyUpdate || locationAllowed !== undefined) {
        const setUpdate = {};
        if (policyUpdate) {
          Object.entries(policyUpdate).forEach(([key, value]) => {
            setUpdate[`devicePolicyState.${key}`] = value;
          });
        }
        if (locationAllowed !== undefined) {
          setUpdate.locationAllowed = locationAllowed;
        }
        await DeviceModel.updateOne({ deviceId: sessionDeviceId }, { $set: setUpdate });
      }
    }

    let loginToken = null;
    if (action === "login" && sessionDeviceId) {
      loginToken = randomUUID();
      await DeviceModel.updateOne(
        { deviceId: sessionDeviceId },
        { $set: { loginToken } }
      );
    }

    if (sessionDeviceId && (action === "login" || action === "logout")) {
      const existingDevice = await DeviceModel.findOne({
        deviceId: sessionDeviceId,
      }).lean();
      const currentPolicy = existingDevice?.devicePolicyState || null;
      if (currentPolicy) {
        const nextPolicy = buildPolicyStateForAction(currentPolicy, action);
        const setUpdate = {};
        Object.entries(nextPolicy).forEach(([key, value]) => {
          setUpdate[`devicePolicyState.${key}`] = value;
        });
        if (Object.keys(setUpdate).length) {
          await DeviceModel.updateOne(
            { deviceId: sessionDeviceId },
            { $set: setUpdate }
          );
        }
      }
    }

    const deviceRecord = sessionDeviceId
      ? await DeviceModel.findOne({ deviceId: sessionDeviceId }).lean()
      : null;
    const deviceSettings = deviceRecord
      ? {
        deviceStatus: deviceRecord.deviceStatus,
        cameraDisabled: deviceRecord.devicePolicyState?.cameraDisabled ?? false,
        uninstallBlocked: deviceRecord.devicePolicyState?.uninstallBlocked ?? false,
        facebookBlocked: deviceRecord.devicePolicyState?.facebookBlocked ?? false,
        instagramBlocked: deviceRecord.devicePolicyState?.instagramBlocked ?? false,
        youtubeBlocked: deviceRecord.devicePolicyState?.youtubeBlocked ?? false,
        whatsappBlocked: deviceRecord.devicePolicyState?.whatsappBlocked ?? false,
        locationAllowed: deviceRecord.locationAllowed ?? true,
        devicePolicyState: deviceRecord.devicePolicyState || {},
      }
      : null;

    const responsePayload = {
      message: action === "login" ? "Logged in successfully" : "Logged out successfully",
      userId: user ? user._id : employee._id,
      employeeId: employee.employeeId,
      deviceId: sessionDeviceId,
      location: resolvedLocation,
      deviceLocation,
      deviceSettings,
      action,
    };

    if (action === "login") {
      responsePayload.loginToken = loginToken;
    }

    void tokenId;

    responsePayload.expiresAt = expMs ? new Date(expMs) : null;

    return res.status(200).json(responsePayload);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ message: "QR expired" });
    }
    console.error("QR Consume Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
