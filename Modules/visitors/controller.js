const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const VisitorModel = require("../user/visitorModel");
const LocationModel = require("../location/model");
const UserSession = require("../user/userSessionsModel");
const paginate = require("../../helpers/limitoffset");
const Validator = require("../../helpers/validators");
const { UPLOAD_ROOT } = require("../../middleware/upload");
const { markAttendance } = require("../../helpers/attendance");
const {
  normalizeLocation,
  resolveLocationScope,
  assertScopedLocation,
} = require("../../helpers/locationScope");

const formatVisitor = (doc) => {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    ...plain,
    id: plain._id?.toString?.() || plain.id,
    name: plain.name || "",
  };
};

const getDotValue = (data, key) => {
  if (!data) return undefined;
  if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
  return key.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), data);
};

const toDisplayName = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) =>
      part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : ""
    )
    .join(" ");

const stripAddressDotKeys = (source = {}) => {
  const cleaned = { ...source };
  Object.keys(cleaned).forEach((key) => {
    if (key.startsWith("currentAddress.") || key.startsWith("permanentAddress.")) {
      delete cleaned[key];
    }
  });
  return cleaned;
};

const normalizeVendorCode = (value) => String(value || "").trim().toUpperCase();
const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const resolveVendorCodeForLocation = async (locationName) => {
  const name = String(locationName || "").trim();
  if (!name) return "";
  const location = await LocationModel.findOne({
    name: new RegExp(`^${escapeRegExp(name)}$`, "i"),
  })
    .select("vendorCode")
    .lean();
  if (!location) return null;
  return normalizeVendorCode(location.vendorCode);
};

const normalizePayload = (data = {}) => {
  const sanitized = stripAddressDotKeys(data);
  const toDate = (v) => (v ? new Date(v) : v);
  const firstName = toDisplayName(sanitized.firstName || sanitized.first_name || "");
  const lastName = toDisplayName(sanitized.lastName || sanitized.last_name || "");
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const nameInput = sanitized.name || sanitized.fullName || sanitized.full_name || "";
  const displayName = toDisplayName(nameInput || fullName);

  return {
    ...sanitized,
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    name: displayName || data.name || "",
    email: sanitized.email || "",
    phone: sanitized.phone || "",
    gender: sanitized.gender || "",
    dob: toDate(sanitized.dob || sanitized.date_of_birth),
    employeeId: sanitized.employeeId || sanitized.employee_id,
    rfid: sanitized.rfid || null,
    role: sanitized.role || "visitor",
    status: sanitized.status || "Active",
    location: sanitized.location || sanitized.locationName || "",
    profileImage: sanitized.profileImage || sanitized.profile_image || "",
    currentAddress: {
      street:
        sanitized.currentAddress?.street ||
        getDotValue(data, "currentAddress.street") ||
        sanitized.currentStreet ||
        sanitized.current_address_street ||
        sanitized.currentaddress ||
        "",
      city:
        sanitized.currentAddress?.city ||
        getDotValue(data, "currentAddress.city") ||
        sanitized.currentCity ||
        sanitized.current_address_city ||
        sanitized.city ||
        "",
      state:
        sanitized.currentAddress?.state ||
        getDotValue(data, "currentAddress.state") ||
        sanitized.currentState ||
        sanitized.current_address_state ||
        sanitized.state ||
        "",
      pincode:
        sanitized.currentAddress?.pincode ||
        getDotValue(data, "currentAddress.pincode") ||
        sanitized.currentPincode ||
        sanitized.current_address_pincode ||
        sanitized.pincode ||
        "",
    },
    permanentAddress: {
      street:
        sanitized.permanentAddress?.street ||
        getDotValue(data, "permanentAddress.street") ||
        sanitized.permanentStreet ||
        sanitized.permanent_address_street ||
        sanitized.permanentaddress ||
        "",
      city:
        sanitized.permanentAddress?.city ||
        getDotValue(data, "permanentAddress.city") ||
        sanitized.permanentCity ||
        sanitized.permanent_address_city ||
        sanitized.permanentCity ||
        sanitized.city ||
        "",
      state:
        sanitized.permanentAddress?.state ||
        getDotValue(data, "permanentAddress.state") ||
        sanitized.permanentState ||
        sanitized.permanent_address_state ||
        sanitized.permanentState ||
        sanitized.state ||
        "",
      pincode:
        sanitized.permanentAddress?.pincode ||
        getDotValue(data, "permanentAddress.pincode") ||
        sanitized.permanentPincode ||
        sanitized.permanent_address_pincode ||
        sanitized.permanentPincode ||
        sanitized.pincode ||
        "",
    },
  };
};

const normalizeSessionStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["logged in", "login", "in"].includes(normalized)) return "Logged In";
  if (["logout", "logged out", "out"].includes(normalized)) return "Logout";
  return null;
};

const validateVisitor = async (data) => {
  const isProvided = (value) => value !== undefined && value !== null && value !== "";
  const rules = {};

  if (isProvided(data.firstName)) rules.firstName = "string";
  if (isProvided(data.lastName)) rules.lastName = "string";
  if (isProvided(data.gender)) rules.gender = "string";
  if (isProvided(data.dob)) rules.dob = "date";
  if (isProvided(data.email)) rules.email = "email";
  if (isProvided(data.phone)) rules.phone = "string";
  if (isProvided(data.employeeId)) rules.employeeId = "string";
  if (isProvided(data.rfid)) rules.rfid = "string";
  if (isProvided(data.role)) rules.role = "string";
  if (isProvided(data.status)) rules.status = "string";
  if (isProvided(data.location)) rules.location = "string";

  if (isProvided(data.currentAddress?.street)) rules["currentAddress.street"] = "string";
  if (isProvided(data.currentAddress?.city)) rules["currentAddress.city"] = "string";
  if (isProvided(data.currentAddress?.state)) rules["currentAddress.state"] = "string";
  if (isProvided(data.currentAddress?.pincode)) rules["currentAddress.pincode"] = "string";

  if (isProvided(data.permanentAddress?.street)) rules["permanentAddress.street"] = "string";
  if (isProvided(data.permanentAddress?.city)) rules["permanentAddress.city"] = "string";
  if (isProvided(data.permanentAddress?.state)) rules["permanentAddress.state"] = "string";
  if (isProvided(data.permanentAddress?.pincode)) rules["permanentAddress.pincode"] = "string";

  if (!Object.keys(rules).length) return;
  const validator = new Validator(data, rules);
  await validator.validate();
};

const removeFileIfExists = (filePath) => {
  if (!filePath) return;
  if (filePath.startsWith("/uploads/")) {
    const absolutePath = path.join(UPLOAD_ROOT, filePath.replace("/uploads/", ""));
    if (fs.existsSync(absolutePath)) {
      fs.unlink(absolutePath, () => { });
    }
    return;
  }
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  if (fs.existsSync(resolved)) {
    fs.unlink(resolved, () => { });
  }
};

exports.add = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const normalized = normalizePayload(req.body);
    if (scope.isAdmin) {
      const requestedLocation = normalizeLocation(normalized.location);
      if (requestedLocation && requestedLocation !== scope.location) {
        return res.status(403).json({
          status: false,
          message: "You can only create visitors for your assigned location",
        });
      }
      normalized.location = scope.location;
    }

    normalized.vendorCode = await resolveVendorCodeForLocation(normalized.location);
    if (normalized.vendorCode === null) {
      return res.status(400).json({
        status: false,
        message: "Unable to resolve location",
      });
    }
    if (req.file) {
      normalized.profileImage = `/uploads/employees/${req.file.filename}`;
    }
    await validateVisitor(normalized);

    const orConditions = [];
    if (normalized.email) orConditions.push({ email: normalized.email });
    if (normalized.employeeId) orConditions.push({ employeeId: normalized.employeeId });
    if (normalized.rfid) orConditions.push({ rfid: normalized.rfid });
    const existing = orConditions.length
      ? await VisitorModel.findOne({ $or: orConditions })
      : null;
    if (existing) {
      return res.status(400).json({
        status: false,
        message: "Visitor already exists with this email/employee ID/RFID",
      });
    }

    const visitor = await VisitorModel.create(normalized);

    return res.status(201).json({
      status: true,
      message: "Visitor created successfully",
      data: visitor,
    });
  } catch (error) {
    if (error.errors) {
      return res.status(400).json({
        status: false,
        message: error.message || "Validation failed",
        errors: error.errors,
      });
    }
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const { page, limit, search, sessionStatus, includeUnverified } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);
    const filter = {};
    if (scope.isAdmin) {
      filter.location = scope.location;
    }
    if (sessionStatus) {
      if (sessionStatus === "Logout") {
        filter.$or = [
          { sessionStatus: "Logout" },
          { sessionStatus: { $exists: false } },
          { sessionStatus: null },
        ];
      } else {
        filter.sessionStatus = sessionStatus;
      }
    }

    const showUnverified =
      includeUnverified === true ||
      includeUnverified === 1 ||
      includeUnverified === "1" ||
      String(includeUnverified || "").toLowerCase() === "true";
    if (!showUnverified) {
      const otpGate = { $or: [{ otpVerified: true }, { otpVerified: { $exists: false } }] };
      filter.$and = Array.isArray(filter.$and) ? [...filter.$and, otpGate] : [otpGate];
    }

    const result = await paginate(
      VisitorModel,
      filter,
      pageNumber,
      limit,
      [],
      [
        "name",
        "employeeId",
        "rfid",
        "deviceId",
        "role",
        "sessionStatus",
        "email",
        "phone",
      ],
      search,
      { createdAt: -1, _id: -1 }
    );

    const visitors = result.data.map(formatVisitor);

    return res.status(200).json({
      status: result.status,
      message: result.message,
      visitors,
      total: result.pagination?.totalrecords || 0,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


exports.update = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const { id } = req.params;
    const existing = await VisitorModel.findById(id);
    if (!existing) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    assertScopedLocation(
      existing.location,
      scope,
      "You can only update visitors from your assigned location"
    );

    const normalized = normalizePayload(req.body);
    if (scope.isAdmin) {
      const requestedLocation = normalizeLocation(normalized.location);
      if (requestedLocation && requestedLocation !== scope.location) {
        return res.status(403).json({
          status: false,
          message: "You can only assign your own location",
        });
      }
      normalized.location = scope.location;
    }

    normalized.location = normalizeLocation(normalized.location) || existing.location || "";
    normalized.vendorCode = await resolveVendorCodeForLocation(normalized.location);
    if (normalized.vendorCode === null) {
      return res.status(400).json({
        status: false,
        message: "Unable to resolve location",
      });
    }
    if (req.file) {
      normalized.profileImage = `/uploads/employees/${req.file.filename}`;
    } else if (!req.body.profileImage && !req.body.profile_image) {
      delete normalized.profileImage;
    }

    await validateVisitor({ ...existing.toObject(), ...normalized });

    const updated = await VisitorModel.findByIdAndUpdate(id, normalized, {
      new: true,
    });

    if (normalized.profileImage && existing.profileImage) {
      removeFileIfExists(existing.profileImage);
    }

    return res.status(200).json({
      status: true,
      message: "Visitor updated successfully",
      data: updated,
    });
  } catch (error) {
    if (error.errors) {
      return res.status(400).json({
        status: false,
        message: error.message || "Validation failed",
        errors: error.errors,
      });
    }
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.updateSessionStatus = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const { id } = req.params;
    const {
      sessionStatus,
      action,
      deviceId,
      location,
      deviceLocation,
      note,
    } = req.body || {};
    const normalizedStatus = normalizeSessionStatus(sessionStatus || action);
    if (!normalizedStatus) {
      return res.status(400).json({
        status: false,
        message: "sessionStatus must be Logged In or Logout",
      });
    }

    const query = mongoose.isValidObjectId(id)
      ? { _id: id }
      : { employeeId: id };
    const visitor = await VisitorModel.findOne(query);
    if (!visitor) {
      return res.status(404).json({ status: false, message: "Visitor not found" });
    }
    assertScopedLocation(
      visitor.location,
      scope,
      "You can only update session for visitors from your assigned location"
    );

    if (visitor.sessionStatus === normalizedStatus) {
      return res.status(400).json({
        status: false,
        message: `Visitor is already ${normalizedStatus}`,
      });
    }

    const attendanceEmployee = {
      employeeId: visitor.employeeId || String(visitor._id),
      rfid: visitor.rfid || `VISITOR-${visitor.employeeId || visitor._id}`,
      section: "Visitor",
      userId: null,
    };
    const attendanceAction = normalizedStatus === "Logged In" ? "login" : "logout";
    await markAttendance(attendanceEmployee, attendanceAction, visitor._id);

    await VisitorModel.findByIdAndUpdate(visitor._id, {
      sessionStatus: normalizedStatus,
    });

    await UserSession.create({
      userId: visitor._id,
      deviceId: deviceId || visitor.deviceId || null,
      employeeId: visitor.employeeId || String(visitor._id),
      action: normalizedStatus,
      token: null,
      location: location ?? visitor.location ?? "",
      deviceLocation,
      raw: {
        source: "admin",
        adminId: req.user?._id || null,
        note: note || null,
      },
    });

    return res.status(200).json({
      status: true,
      message: "Session status updated",
      sessionStatus: normalizedStatus,
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const { id } = req.params;
    const visitor = await VisitorModel.findById(id);
    if (!visitor) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    assertScopedLocation(
      visitor.location,
      scope,
      "You can only delete visitors from your assigned location"
    );

    await VisitorModel.findByIdAndDelete(id);
    if (visitor.profileImage) {
      removeFileIfExists(visitor.profileImage);
    }

    return res.status(200).json({
      status: true,
      message: "Visitor deleted successfully",
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const { id } = req.params;
    const query = mongoose.isValidObjectId(id)
      ? { _id: id }
      : { employeeId: id };

    const visitor = await VisitorModel.findOne(query);
    if (!visitor) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    assertScopedLocation(
      visitor.location,
      scope,
      "You can only access visitors from your assigned location"
    );

    return res.status(200).json({
      status: true,
      message: "Record fetched",
      data: formatVisitor(visitor),
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};
