const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const EmployeeModel = require("./model");
const UserModel = require("../user/model");
const VisitorModel = require("../user/visitorModel");
const LocationModel = require("../location/model");
const UserSession = require("../user/userSessionsModel");
const DeviceModel = require("../device/model");
const DeviceEventModel = require("../device/deviceEventModel");
const AttendanceModel = require("../attendance/model");
const paginate = require("../../helpers/limitoffset");
const Validator = require("../../helpers/validators");
const { UPLOAD_ROOT } = require("../../middleware/upload");
const { markAttendance } = require("../../helpers/attendance");
const {
  normalizeLocation,
  resolveLocationScope,
  assertScopedLocation,
} = require("../../helpers/locationScope");
const {
  normalizeSingleTag,
  normalizeTagList,
  sendNotificationToTaggedEmployees,
} = require("../../helpers/tagNotifications");
const PRIVILEGED_ROLES = ["admin", "superadmin"];
const isPrivilegedRole = (role) =>
  PRIVILEGED_ROLES.includes(String(role || "").toLowerCase());

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
  if (!location) return null; // Distinguish between "not found" and "empty vendor code"
  return normalizeVendorCode(location.vendorCode);
};

const getDotValue = (data, key) => {
  if (!data) return undefined;
  if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
  return key.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), data);
};

const normalizePayload = (data) => {
  const toDate = (v) => (v ? new Date(v) : v);
  const nameInput = data.name || data.fullName || data.full_name || "";
  let firstName = data.firstName || data.first_name || "";
  let lastName = data.lastName || data.last_name || "";

  if ((!firstName || !lastName) && nameInput) {
    const parts = String(nameInput)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!firstName && parts.length) {
      firstName = parts[0];
    }
    if (!lastName) {
      lastName = parts.slice(1).join(" ").trim() || parts[0] || "";
    }
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const name = nameInput || fullName;
  const tag =
    data.tags !== undefined || data.tag !== undefined
      ? normalizeSingleTag(data.tags ?? data.tag)
      : undefined;

  return {
    ...data,
    ...(name ? { name } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    profileImage: data.profileImage || data.profile_image || "",
    currentAddress: {
      street:
        data.currentAddress?.street ||
        getDotValue(data, "currentAddress.street") ||
        data.currentStreet ||
        data.current_address_street ||
        data.currentaddress,
      city:
        data.currentAddress?.city ||
        getDotValue(data, "currentAddress.city") ||
        data.currentCity ||
        data.current_address_city ||
        data.city,
      state:
        data.currentAddress?.state ||
        getDotValue(data, "currentAddress.state") ||
        data.currentState ||
        data.current_address_state ||
        data.state,
      pincode:
        data.currentAddress?.pincode ||
        getDotValue(data, "currentAddress.pincode") ||
        data.currentPincode ||
        data.current_address_pincode ||
        data.pincode,
    },
    permanentAddress: {
      street:
        data.permanentAddress?.street ||
        getDotValue(data, "permanentAddress.street") ||
        data.permanentStreet ||
        data.permanent_address_street ||
        data.permanentaddress,
      city:
        data.permanentAddress?.city ||
        getDotValue(data, "permanentAddress.city") ||
        data.permanentCity ||
        data.permanent_address_city ||
        data.permanentCity ||
        data.city,
      state:
        data.permanentAddress?.state ||
        getDotValue(data, "permanentAddress.state") ||
        data.permanentState ||
        data.permanent_address_state ||
        data.permanentState ||
        data.state,
      pincode:
        data.permanentAddress?.pincode ||
        getDotValue(data, "permanentAddress.pincode") ||
        data.permanentPincode ||
        data.permanent_address_pincode ||
        data.permanentPincode ||
        data.pincode,
    },
    joiningDate: toDate(data.joiningDate || data.joining_date),
    dob: toDate(data.dob || data.date_of_birth),
    employmentType: data.employmentType || data.employment_type || "Full-time",
    status: data.status || "Active",
    role: data.role || "employee",
    location: data.location || data.locationName || "",
    bankDetails: {
      aadharcardnumber:
        data.bankDetails?.aadharcardnumber ||
        getDotValue(data, "bankDetails.aadharcardnumber") ||
        data.aadharcardnumber,
      pancard:
        data.bankDetails?.pancard ||
        getDotValue(data, "bankDetails.pancard") ||
        data.pancard,
      accountNumber:
        data.bankDetails?.accountNumber ||
        getDotValue(data, "bankDetails.accountNumber") ||
        data.accountNumber,
      ifscCode:
        data.bankDetails?.ifscCode ||
        getDotValue(data, "bankDetails.ifscCode") ||
        data.ifscCode,
      bankName:
        data.bankDetails?.bankName ||
        getDotValue(data, "bankDetails.bankName") ||
        data.bankName,
      branch:
        data.bankDetails?.branch ||
        getDotValue(data, "bankDetails.branch") ||
        data.branch,
    },
    emergencyContact: {
      name:
        data.emergencyContact?.name ||
        getDotValue(data, "emergencyContact.name") ||
        data.emergencyName ||
        data.emergency_contact_name ||
        data.emergency_contact,
      relation:
        data.emergencyContact?.relation ||
        getDotValue(data, "emergencyContact.relation") ||
        data.emergencyRelation ||
        data.emergency_contact_relation ||
        data.emergency_relation,
      phone:
        data.emergencyContact?.phone ||
        getDotValue(data, "emergencyContact.phone") ||
        data.emergencyPhone ||
        data.emergency_contact_phone,
    },
    systemAccess: {
      emailVerified: !!data.emailVerified,
      phoneVerified: !!data.phoneVerified,
      loginEnabled: data.loginEnabled !== false,
      lastLogin: toDate(data.lastLogin),
    },
    ...(tag !== undefined ? { tag } : {}),
  };
};

const normalizeSessionStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["logged in", "login", "in"].includes(normalized)) return "Logged In";
  if (["logout", "logged out", "out"].includes(normalized)) return "Logout";
  return null;
};

const getLatestAttendanceSessionStatus = (records = []) => {
  const attendanceEvents = [];

  records.forEach((record) => {
    const entryAt = record.entryGateIn || record.workfloorIn || null;
    const exitAt = record.exitGateOut || record.workfloorOut || null;

    if (entryAt) {
      attendanceEvents.push({
        status: "Logged In",
        timestamp: new Date(entryAt),
      });
    }

    if (exitAt) {
      attendanceEvents.push({
        status: "Logout",
        timestamp: new Date(exitAt),
      });
    }
  });

  attendanceEvents.sort((a, b) => b.timestamp - a.timestamp);
  return attendanceEvents[0]?.status || null;
};

const validateEmployeeData = async (data) => {
  const rules = {
    firstName: "required|string",
    lastName: "required|string",
    gender: "required|string",
    dob: "required|date",
    email: "required|email",
    phone: "required|string",

    "currentAddress.street": "required|string",
    "currentAddress.city": "required|string",
    "currentAddress.state": "required|string",
    "currentAddress.pincode": "required|string",

    "permanentAddress.street": "required|string",
    "permanentAddress.city": "required|string",
    "permanentAddress.state": "required|string",
    "permanentAddress.pincode": "required|string",

    employeeId: "required|string",
    joiningDate: "required|date",
    designation: "required|string",
    department: "required|string",
    section: "required|string",
    shift: "required|string",
    employmentType: "required|string",
    role: "required|string",
    status: "required|string",

    "bankDetails.aadharcardnumber": "required|string",
    "bankDetails.pancard": "required|string",
    "bankDetails.accountNumber": "required|string",
    "bankDetails.ifscCode": "required|string",

  };
  const validator = new Validator(data, rules);
  await validator.validate();
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
          message: "You can only create employees for your assigned location",
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
    await validateEmployeeData(normalized);

    const existing = await EmployeeModel.findOne({ email: normalized.email });
    if (existing) {
      return res
        .status(400)
        .json({ status: false, message: "Employee already exists with this email" });
    }

    const normalizedRole = "employee";
    let userId = null;

    // Do not store password; keep null for records created via this flow
    const data = {
      ...normalized,
      role: normalizedRole,
      password: null,
      userId,
      otpVerified: true,
      otpVerifiedAt: new Date(),
    };

    const employee = await EmployeeModel.create(data);

    return res.status(201).json({
      status: true,
      message: "Employee created successfully",
      data: employee,
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
    const { page, limit, search, status, department, attendanceStatus, includeUnverified } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);
    const filter = {};
    if (scope.isAdmin) {
      filter.location = scope.location;
      filter.role = { $nin: PRIVILEGED_ROLES };
    }
    if (status) filter["status"] = status;
    if (department) filter["department"] = department;
    if (attendanceStatus) filter["attendanceStatus"] = attendanceStatus;
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
      EmployeeModel,
      filter,
      pageNumber,
      limit,
      [],
      ["firstName", "lastName", "name", "email", "rfid", "designation", "employeeId", "department"],
      search,
      { role: 1, createdAt: -1, _id: -1 }
    );

    // Normalize payload for UI (add id and name)
    const employees = result.data.map((doc) => {
      const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
      const fullName = `${plain.firstName || ""} ${plain.lastName || ""}`.trim();
      return {
        ...plain,
        id: plain._id?.toString?.() || plain.id,
        name: plain.name || fullName,
      };
    });

    const userIds = employees.map((emp) => emp.userId).filter(Boolean);
    const empIds = employees.map((emp) => emp.employeeId).filter(Boolean);

    const [sessionData, deviceData, attendanceData] = await Promise.all([
      userIds.length
        ? UserModel.find({ _id: { $in: userIds } }).select("_id sessionStatus").lean()
        : Promise.resolve([]),
      empIds.length
        ? DeviceModel.find({ employeeId: { $in: empIds }, verified: { $ne: false } }).select("employeeId deviceId").lean()
        : Promise.resolve([]),
      empIds.length
        ? AttendanceModel.find({ employeeId: { $in: empIds } })
          .select("employeeId entryGateIn workfloorIn workfloorOut exitGateOut date updatedAt createdAt")
          .sort({ date: -1, updatedAt: -1, createdAt: -1, _id: -1 })
          .lean()
        : Promise.resolve([]),
    ]);

    const sessionMap = {};
    sessionData.forEach((u) => {
      sessionMap[String(u._id)] = u.sessionStatus;
    });

    const deviceMap = {};
    deviceData.forEach((d) => {
      if (d.employeeId) deviceMap[d.employeeId] = d.deviceId || String(d._id);
    });

    const attendanceMap = {};
    attendanceData.forEach((record) => {
      const key = String(record.employeeId || "").trim();
      if (!key) return;
      if (!attendanceMap[key]) attendanceMap[key] = [];
      attendanceMap[key].push(record);
    });

    const employeesWithData = employees.map((emp) => ({
      ...emp,
      sessionStatus:
        getLatestAttendanceSessionStatus(attendanceMap[String(emp.employeeId)] || []) ||
        sessionMap[String(emp.userId)] ||
        "Logout",
      deviceId: deviceMap[emp.employeeId] || emp.deviceId || "-",
    }));

    return res.status(200).json({
      status: result.status,
      message: result.message,
      employees: employeesWithData,
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

exports.getIndexes = async (_req, res) => {
  try {
    const indexes = await EmployeeModel.collection.listIndexes().toArray();
    return res.status(200).json({
      status: true,
      message: "Indexes fetched",
      indexes: indexes.map((idx) => ({
        name: idx.name,
        key: idx.key,
        unique: !!idx.unique,
      })),
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.cleanupIndexes = async (_req, res) => {
  try {
    const collection = EmployeeModel.collection;
    const indexes = await collection.listIndexes().toArray();
    const legacy = indexes.filter((idx) => {
      if (!idx?.key) return false;
      return Object.keys(idx.key).some(
        (key) => key.startsWith("professional.") || key.startsWith("personal.")
      );
    });
    const dropped = [];
    for (const idx of legacy) {
      await collection.dropIndex(idx.name);
      dropped.push(idx.name);
    }
    return res.status(200).json({
      status: true,
      message: "Legacy indexes cleaned",
      dropped,
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.getbyid = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const param = req.params.id;
    const employee = await EmployeeModel.findOne({
      $or: [{ _id: param }, { rfid: param }],
    });
    if (!employee) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    if (scope.isAdmin && isPrivilegedRole(employee.role)) {
      return res.status(403).json({
        status: false,
        message: "Only superadmin can access admin/superadmin profiles",
      });
    }
    assertScopedLocation(
      employee.location,
      scope,
      "You can only access employees from your assigned location"
    );

    return res.status(200).json({ employee });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.getOverviewByEmployeeId = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const employeeId = String(req.params.employeeId || "").trim();
    if (!employeeId) {
      return res.status(400).json({ status: false, message: "employeeId is required" });
    }

    let principalType = "employee";
    let principal = await EmployeeModel.findOne({ employeeId }).lean();
    if (!principal) {
      principalType = "visitor";
      principal = await VisitorModel.findOne({ employeeId }).lean();
    }
    if (!principal) {
      return res.status(404).json({ status: false, message: "Not found" });
    }

    if (principalType === "employee") {
      if (scope.isAdmin && isPrivilegedRole(principal.role)) {
        return res.status(403).json({
          status: false,
          message: "Only superadmin can access admin/superadmin profiles",
        });
      }
      assertScopedLocation(
        principal.location,
        scope,
        "You can only access employees from your assigned location"
      );
    } else {
      assertScopedLocation(
        principal.location,
        scope,
        "You can only access visitors from your assigned location"
      );
    }

    const baseViolationFilter = { employeeId, policyVoilation: true };
    const cameraRegex = /camera|screenshot|video/i;
    const accessRegex = /youtube|whatsapp|instagram|facebook|restricted app opened/i;
    const securityRegex =
      /overlay|notification permission|location permission|device admin|accessibility|usage access/i;

    const [
      devices,
      violationsTotal,
      cameraViolations,
      accessViolations,
      securityViolations,
      recentViolationEvents,
      attendance,
      sessionStatus,
      latestSession,
    ] = await Promise.all([
      DeviceModel.find({ employeeId, verified: { $ne: false } })
        .select(
          "deviceId deviceName status deviceStatus platform model osVersion appVersion verified lastSeen lastOnline createdAt"
        )
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
      DeviceEventModel.countDocuments(baseViolationFilter),
      DeviceEventModel.countDocuments({
        ...baseViolationFilter,
        event: { $regex: cameraRegex },
      }),
      DeviceEventModel.countDocuments({
        ...baseViolationFilter,
        event: { $regex: accessRegex },
      }),
      DeviceEventModel.countDocuments({
        ...baseViolationFilter,
        event: { $regex: securityRegex },
      }),
      DeviceEventModel.find(baseViolationFilter)
        .select("event timestamp narrative metadata imagePath cameraStatus policyVoilation")
        .sort({ timestamp: -1, _id: -1 })
        .limit(200)
        .lean(),
      AttendanceModel.find({ employeeId })
        .select(
          "date rfidCardId location sectionAssigned status entryGateIn workfloorIn workfloorOut exitGateOut totalWorkHours"
        )
        .sort({ date: -1, _id: -1 })
        .limit(60)
        .lean(),
      principal.userId
        ? UserModel.findById(principal.userId).select("sessionStatus").lean()
        : UserModel.findOne({ employeeId }).select("sessionStatus").lean(),
      UserSession.findOne({ employeeId })
        .sort({ createdAt: -1, _id: -1 })
        .select("action createdAt")
        .lean(),
    ]);

    return res.status(200).json({
      status: true,
      data: {
        principalType,
        profile: {
          id: principal._id || null,
          name: principal.name || `${principal.firstName || ""} ${principal.lastName || ""}`.trim(),
          employeeId: principal.employeeId || employeeId,
          tag: principal.tag || "",
          email: principal.email || "",
          phone: principal.phone || "",
          gender: principal.gender || "",
          department: principal.department || "",
          designation: principal.designation || "",
          role: principal.role || "",
          status: principal.status || "",
          location: principal.location || "",
          rfid: principal.rfid || "",
          createdAt: principal.createdAt || null,
          lastSeen: principal.systemAccess?.lastLogin || principal.updatedAt || null,
          sessionStatus:
            latestSession?.action ||
            sessionStatus?.sessionStatus ||
            principal.sessionStatus ||
            "Logout",
        },
        counts: {
          policyViolations: violationsTotal || 0,
          camera: cameraViolations || 0,
          appAccess: accessViolations || 0,
          securityPermission: securityViolations || 0,
        },
        devices: devices || [],
        attendance: attendance || [],
        violationEvents: recentViolationEvents || [],
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || "Server error",
    });
  }
};

exports.update = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const existing = await EmployeeModel.findById(req.params.id).select(
      "profileImage location role"
    );
    if (!existing) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    if (scope.isAdmin && isPrivilegedRole(existing.role)) {
      return res.status(403).json({
        status: false,
        message: "Only superadmin can update admin/superadmin profiles",
      });
    }
    assertScopedLocation(
      existing.location,
      scope,
      "You can only update employees from your assigned location"
    );

    const normalized = normalizePayload(req.body);
    const updates = { ...normalized, role: "employee" };
    if (scope.isAdmin) {
      const requestedLocation = normalizeLocation(updates.location);
      if (requestedLocation && requestedLocation !== scope.location) {
        return res.status(403).json({
          status: false,
          message: "You can only assign your own location",
        });
      }
      updates.location = scope.location;
    }

    updates.location = normalizeLocation(updates.location) || existing.location || "";
    updates.vendorCode = await resolveVendorCodeForLocation(updates.location);
    if (updates.vendorCode === null) {
      return res.status(400).json({
        status: false,
        message: "Unable to resolve location",
      });
    }

    const previous = req.file ? existing : null;
    if (!req.file && !req.body.profileImage && !req.body.profile_image) {
      delete updates.profileImage;
    }
    if (req.file) {
      updates.profileImage = `/uploads/employees/${req.file.filename}`;
    }

    // Do not process password updates in this flow
    delete updates.password;

    // Removal of user update sync logic as per request.
    const updated = await EmployeeModel.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: false,
    });
    if (!updated) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    if (req.file && previous?.profileImage) {
      const oldPath = previous.profileImage;
      if (oldPath.startsWith("/uploads/")) {
        const absolutePath = path.join(UPLOAD_ROOT, oldPath.replace("/uploads/", ""));
        try {
          await fs.promises.unlink(absolutePath);
        } catch (err) {
          if (err.code !== "ENOENT") {
            console.warn("Failed to delete image:", absolutePath, err.message);
          }
        }
      }
    }
    return res.status(200).json({
      status: true,
      message: "Updated successfully",
      data: updated,
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const { users, status } = req.body;
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ status: false, message: "Users missing" });
    }
    const result = await EmployeeModel.updateMany(
      {
        _id: { $in: users },
        ...(scope.isAdmin ? { location: scope.location } : {}),
        ...(scope.isAdmin ? { role: { $nin: PRIVILEGED_ROLES } } : {}),
      },
      { $set: { status } }
    );
    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No users found with the provided IDs" });
    }
    return res.status(200).json({
      status: true,
      message: "Status updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.updateTags = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const existing = await EmployeeModel.findById(req.params.id).select(
      "location role tag employeeId name"
    );
    if (!existing) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    if (scope.isAdmin && isPrivilegedRole(existing.role)) {
      return res.status(403).json({
        status: false,
        message: "Only superadmin can update admin/superadmin profiles",
      });
    }
    assertScopedLocation(
      existing.location,
      scope,
      "You can only update employees from your assigned location"
    );

    const tag = normalizeSingleTag(req.body?.tag ?? req.body?.tags);
    const updated = await EmployeeModel.findByIdAndUpdate(
      req.params.id,
      { $set: { tag } },
      { new: true, runValidators: false }
    ).select("employeeId name tag");

    return res.status(200).json({
      status: true,
      message: "Tags updated successfully",
      data: updated,
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};

exports.sendTaggedTestNotification = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const location = String(req.body?.location || "").trim();
    const tags = normalizeTagList(req.body?.tags);
    const title = String(req.body?.title || "Tagged Test Notification").trim();
    const message = String(
      req.body?.message || "This is a test notification for tagged employees."
    ).trim();

    if (!location) {
      return res.status(400).json({ status: false, message: "location is required" });
    }
    if (!tags.length) {
      return res.status(400).json({ status: false, message: "At least one tag is required" });
    }
    assertScopedLocation(
      location,
      scope,
      "You can only send tagged notifications for your assigned location"
    );

    const result = await sendNotificationToTaggedEmployees({
      location,
      tags,
      title,
      body: message,
      data: {
        type: "tagged_test_notification",
        location,
        tags: JSON.stringify(tags),
      },
    });

    return res.status(200).json({
      status: true,
      message: "Tagged test notification processed",
      data: result,
    });
  } catch (error) {
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
    const employee = await EmployeeModel.findOne(query);
    if (!employee) {
      return res.status(404).json({ status: false, message: "Employee not found" });
    }
    if (scope.isAdmin && isPrivilegedRole(employee.role)) {
      return res.status(403).json({
        status: false,
        message: "Only superadmin can update admin/superadmin sessions",
      });
    }
    assertScopedLocation(
      employee.location,
      scope,
      "You can only update session for employees from your assigned location"
    );

    const userByLinkedId = employee.userId
      ? await UserModel.findById(employee.userId)
      : null;
    const userByEmployeeId = await UserModel.findOne({
      employeeId: employee.employeeId,
    });
    const user = userByLinkedId || userByEmployeeId;
    if (user && user.sessionStatus === normalizedStatus) {
      return res.status(400).json({
        status: false,
        message: `User is already ${normalizedStatus}`,
      });
    }

    if (!employee.rfid || !employee.section) {
      return res.status(400).json({
        status: false,
        message: "Employee RFID/section missing for attendance",
      });
    }

    const attendanceAction = normalizedStatus === "Logged In" ? "login" : "logout";
    await markAttendance(employee, attendanceAction, user?._id);

    if (user) {
      await UserModel.findByIdAndUpdate(user._id, {
        sessionStatus: normalizedStatus,
      });
    }
    if (!employee.userId && user?._id) {
      await EmployeeModel.findByIdAndUpdate(employee._id, {
        $set: { userId: user._id },
      });
    }

    await UserSession.create({
      userId: user?._id || null,
      deviceId: deviceId || null,
      employeeId: employee.employeeId,
      action: normalizedStatus,
      token: null,
      location: location ?? employee.location ?? user.location ?? "",
      deviceLocation,
      raw: {
        source: "admin",
        adminId: req.user?._id || null,
        note: note || null,
      },
    });
    if (normalizedStatus === "Logout") {
      await DeviceModel.updateMany(
        { employeeId: employee.employeeId },
        {
          $set: {
            loginToken: null,
            status: "OFFLINE",
            "metadata.lastForcedLogoutAt": new Date(),
          },
        }
      );
    }

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

exports.delete = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    let recordIds = req.body?.recordId || req.params?.id;
    if (!recordIds) {
      return res
        .status(404)
        .json({ status: false, message: "Record ID(s) not found" });
    }
    if (typeof recordIds === "string") recordIds = [recordIds];
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Record ID(s) must be a non-empty string or array",
      });
    }

    const employees = await EmployeeModel.find({
      _id: { $in: recordIds },
      ...(scope.isAdmin ? { location: scope.location } : {}),
      ...(scope.isAdmin ? { role: { $nin: PRIVILEGED_ROLES } } : {}),
    }).select(
      "_id userId employeeId profileImage"
    );
    if (scope.isAdmin && employees.length !== recordIds.length) {
      return res.status(403).json({
        status: false,
        message: "You can only delete employees from your assigned location",
      });
    }
    const userIds = employees
      .map((employee) => employee.userId)
      .filter(Boolean);
    const employeeIds = employees
      .map((employee) => employee.employeeId)
      .filter(Boolean);
    const imagePaths = employees
      .map((employee) => employee.profileImage)
      .filter(Boolean);

    const result = await EmployeeModel.deleteMany({
      _id: { $in: recordIds },
      ...(scope.isAdmin ? { location: scope.location } : {}),
      ...(scope.isAdmin ? { role: { $nin: PRIVILEGED_ROLES } } : {}),
    });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No matching records found" });
    }

    if (userIds.length > 0 || employeeIds.length > 0) {
      await UserModel.deleteMany({
        $or: [
          ...(userIds.length ? [{ _id: { $in: userIds } }] : []),
          ...(employeeIds.length ? [{ employeeId: { $in: employeeIds } }] : []),
        ],
      });
    }

    if (imagePaths.length > 0) {
      await Promise.all(
        imagePaths.map(async (imagePath) => {
          if (!imagePath.startsWith("/uploads/")) return;
          const absolutePath = path.join(UPLOAD_ROOT, imagePath.replace("/uploads/", ""));
          try {
            await fs.promises.unlink(absolutePath);
          } catch (err) {
            if (err.code !== "ENOENT") {
              console.warn("Failed to delete image:", absolutePath, err.message);
            }
          }
        })
      );
    }

    return res.status(200).json({
      status: true,
      message: `${result.deletedCount} record(s) deleted successfully`,
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({ status: false, message: error.message });
  }
};
