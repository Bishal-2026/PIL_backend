const SettingsModel = require("./model");
const EmployeeModel = require("../employees/model");
const { resolveLocationByNameOrAlias } = require("../location/resolver");

const normalizeRole = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const compact = raw.replace(/[\s_]+/g, "");
  if (compact === "hrmanager") return "hr";
  if (compact === "superadmin" || compact === "admin") return compact;
  if (compact === "hr" || compact === "manager") return compact;
  return raw;
};

const toBool = (v, fallback) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (v.toLowerCase() === "true") return true;
    if (v.toLowerCase() === "false") return false;
  }
  if (typeof v === "number") return v === 1;
  return fallback;
};

const normalizePayload = (body = {}) => {
  const deviceControls =
    typeof body.deviceControls === "string"
      ? JSON.parse(body.deviceControls)
      : body.deviceControls || {};
  const alerts =
    typeof body.alerts === "string"
      ? JSON.parse(body.alerts)
      : body.alerts || {};
  const workingHours =
    typeof body.workingHours === "string"
      ? JSON.parse(body.workingHours)
      : body.workingHours || {};
  const qrExpirySeconds =
    Number.isFinite(Number(body.qrExpirySeconds)) && Number(body.qrExpirySeconds) > 0
      ? Number(body.qrExpirySeconds)
      : undefined;
  const otpEmail = body.otpEmail ? String(body.otpEmail).trim().toLowerCase() : undefined;

  return {
    apiEndpointUrl: body.apiEndpointUrl,
    unitLocation: body.unitLocation,
    apkFileUrl: body.apkFileUrl,
    companyLogoUrl: body.companyLogoUrl,
    qrExpirySeconds,
    otpEmail,
    deviceControls: {
      cameraAccess: toBool(deviceControls.cameraAccess, true),
      allowAppUninstall: toBool(deviceControls.allowAppUninstall, false),
      locationAccess: toBool(deviceControls.locationAccess, true),
      allowScreenshots: toBool(deviceControls.allowScreenshots, false),
      blockUnknownApps: toBool(deviceControls.blockUnknownApps, true),
      autoSyncEnable: toBool(deviceControls.autoSyncEnable, true),
      whatsappCameraAccess: toBool(deviceControls.whatsappCameraAccess, false),
      facebookCameraAccess: toBool(deviceControls.facebookCameraAccess, false),
    },
    alerts: {
      appInstallAlert: toBool(alerts.appInstallAlert, true),
      appUninstallAlert: toBool(alerts.appUninstallAlert, true),
      screenshotAlert: toBool(alerts.screenshotAlert, false),
      cameraActivityAlert: toBool(alerts.cameraActivityAlert, false),
    },
    workingHours: {
      enabled: toBool(workingHours.enabled, false),
      startTime: workingHours.startTime || "09:30",
      endTime: workingHours.endTime || "18:30",
    },
    metadata: body.metadata,
  };
};

const normalizeLocation = (value) => String(value || "").trim();

const resolveUserLocation = async (user = {}) => {
  const directLocation = normalizeLocation(user.location);
  if (directLocation) {
    return directLocation;
  }

  const employeeId = normalizeLocation(user.employeeId);
  if (!employeeId) {
    return "";
  }

  const employee = await EmployeeModel.findOne({ employeeId }).lean();
  return normalizeLocation(employee?.location);
};

const resolveSettingsScope = async (req) => {
  const role = normalizeRole(req.user?.role);
  const requestedLocation = normalizeLocation(req.query?.unitLocation);
  const payloadLocation = normalizeLocation(req.body?.unitLocation);

  if (role === "superadmin") {
    return {
      role,
      allowedLocation: "",
      queryLocation: requestedLocation,
      updateLocation: payloadLocation,
    };
  }

  if (role === "admin") {
    const adminLocation = await resolveUserLocation(req.user);
    if (!adminLocation) {
      const error = new Error("Admin location is not configured");
      error.statusCode = 403;
      throw error;
    }

    if (requestedLocation && requestedLocation !== adminLocation) {
      const error = new Error("You can only access your assigned location settings");
      error.statusCode = 403;
      throw error;
    }

    if (payloadLocation && payloadLocation !== adminLocation) {
      const error = new Error("You can only update your assigned location settings");
      error.statusCode = 403;
      throw error;
    }

    return {
      role,
      allowedLocation: adminLocation,
      queryLocation: adminLocation,
      updateLocation: adminLocation,
    };
  }

  if (role === "hr" || role === "manager") {
    const userLocation = await resolveUserLocation(req.user);
    if (!userLocation) {
      const error = new Error("User location is not configured");
      error.statusCode = 403;
      throw error;
    }

    if (requestedLocation && requestedLocation !== userLocation) {
      const error = new Error("You can only access your assigned location settings");
      error.statusCode = 403;
      throw error;
    }

    if (payloadLocation && payloadLocation !== userLocation) {
      const error = new Error("You can only update your assigned location settings");
      error.statusCode = 403;
      throw error;
    }

    return {
      role,
      allowedLocation: userLocation,
      queryLocation: userLocation,
      updateLocation: userLocation,
    };
  }

  const error = new Error("You are not authorized to access settings");
  error.statusCode = 403;
  throw error;
};

exports.get = async (req, res) => {
  try {
    const scope = await resolveSettingsScope(req);
    const unitLocation = scope.queryLocation;
    const filter = unitLocation ? { unitLocation } : {};
    const record = await SettingsModel.findOne(filter);
    res.status(200).json({
      status: true,
      data: record || {},
      scope: {
        role: scope.role,
        unitLocation: scope.allowedLocation || scope.queryLocation || "",
      },
    });
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const scope = await resolveSettingsScope(req);
    const unitLocation = normalizeLocation(scope.updateLocation || payload.unitLocation);
    if (!unitLocation) {
      return res
        .status(400)
        .json({ status: false, message: "unitLocation is required" });
    }

    const locationRecord = await resolveLocationByNameOrAlias({ location: unitLocation });
    payload.unitLocation = locationRecord?.name ? String(locationRecord.name).trim() : unitLocation;
    payload.unitLocationId = locationRecord?._id || null;
    const apkFile = req.files?.apkFile?.[0];
    const companyLogo = req.files?.companyLogo?.[0];

    if (apkFile) {
      payload.apkFileUrl = `/uploads/settings/${apkFile.filename}`;
    }
    if (companyLogo) {
      payload.companyLogoUrl = `/uploads/settings/${companyLogo.filename}`;
    }
    const record = await SettingsModel.findOneAndUpdate(
      { unitLocation },
      payload,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );
    res.status(200).json({ status: true, message: "Settings saved", data: record });
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};
