const mongoose = require("mongoose");
const AttendanceModel = require("./model");
const EmployeeModel = require("../employees/model");
const VisitorModel = require("../user/visitorModel");
const UserModel = require("../user/model");
const DeviceModel = require("../device/model");
const SettingsModel = require("../settings/model");
const UserSession = require("../user/userSessionsModel");
const Validator = require("../../helpers/validators");
const { resolveLocationScope } = require("../../helpers/locationScope");

const validateAttendanceData = async (data) => {
  const rules = {
    rfidCardId: "required|string",
    date: "required|date"
  };
  const validator = new Validator(data, rules);
  await validator.validate();
};

const buildAttendanceScopeFilter = async (req) => {
  const scope = await resolveLocationScope(req);
  if (!scope.isAdmin) {
    return null;
  }

  const [employees, visitors, users] = await Promise.all([
    EmployeeModel.find({ location: scope.location }).select("employeeId").lean(),
    VisitorModel.find({ location: scope.location }).select("employeeId _id").lean(),
    UserModel.find({ location: scope.location }).select("_id").lean(),
  ]);

  const employeeIds = new Set();
  employees.forEach((doc) => {
    if (doc?.employeeId) employeeIds.add(String(doc.employeeId));
  });
  visitors.forEach((doc) => {
    if (doc?.employeeId) employeeIds.add(String(doc.employeeId));
  });

  const userIds = new Set();
  users.forEach((doc) => {
    if (doc?._id) userIds.add(String(doc._id));
  });
  visitors.forEach((doc) => {
    if (doc?._id) userIds.add(String(doc._id));
  });

  const or = [];
  if (employeeIds.size > 0) {
    or.push({ employeeId: { $in: Array.from(employeeIds) } });
  }
  if (userIds.size > 0) {
    or.push({ userId: { $in: Array.from(userIds) } });
  }

  // Include records where the activity actually happened at this location
  if (scope.locationId) {
    or.push({ locationId: scope.locationId });
  }
  if (scope.location) {
    or.push({ location: scope.location });
  }

  if (or.length === 0) {
    return { _id: { $in: [] } };
  }

  return { $or: or };
};

const withScopeFilter = (filter = {}, scopeFilter = null) => {
  if (!scopeFilter) return filter;
  return { $and: [filter, scopeFilter] };
};

const DEFAULT_ATTENDANCE_WINDOW = {
  startTime: "06:00",
  endTime: "07:30",
  spansNextDay: true,
};

const parseTimeToMinutes = (value, fallback) => {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
  return hours * 60 + minutes;
};

const getDateAtMinutes = (baseDate, minutes) => {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(minutes, 0, 0);
  return date;
};

const resolveAttendanceWindowConfig = async (location = "") => {
  const fallbackStart = parseTimeToMinutes(DEFAULT_ATTENDANCE_WINDOW.startTime, 6 * 60);
  const fallbackEnd = parseTimeToMinutes(DEFAULT_ATTENDANCE_WINDOW.endTime, 7 * 60 + 30);
  const normalizedLocation = String(location || "").trim();

  if (!normalizedLocation) {
    return {
      startMinutes: fallbackStart,
      endMinutes: fallbackEnd,
      spansNextDay: DEFAULT_ATTENDANCE_WINDOW.spansNextDay,
    };
  }

  const settings = await SettingsModel.findOne({ unitLocation: normalizedLocation })
    .select("workingHours")
    .lean();
  const workingHours = settings?.workingHours || {};
  const hasCustomWindow =
    workingHours &&
    typeof workingHours.startTime === "string" &&
    typeof workingHours.endTime === "string";

  if (!hasCustomWindow) {
    return {
      startMinutes: fallbackStart,
      endMinutes: fallbackEnd,
      spansNextDay: DEFAULT_ATTENDANCE_WINDOW.spansNextDay,
    };
  }

  const startMinutes = parseTimeToMinutes(workingHours.startTime, fallbackStart);
  const endMinutes = parseTimeToMinutes(workingHours.endTime, fallbackEnd);
  const spansNextDay = workingHours.enabled
    ? endMinutes <= startMinutes
    : DEFAULT_ATTENDANCE_WINDOW.spansNextDay;

  return { startMinutes, endMinutes, spansNextDay };
};

const buildAttendanceWindowRange = (anchorDate, windowConfig) => {
  const start = getDateAtMinutes(anchorDate, windowConfig.startMinutes);
  const end = getDateAtMinutes(anchorDate, windowConfig.endMinutes);
  if (windowConfig.spansNextDay) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
};

const getAttendanceWindowRange = async (dateInput, location = "") => {
  let anchorDate = new Date();
  if (dateInput) {
    const [y, m, d] = String(dateInput).split("-").map((part) => parseInt(part, 10));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      anchorDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }
  const windowConfig = await resolveAttendanceWindowConfig(location);
  return buildAttendanceWindowRange(anchorDate, windowConfig);
};

const getDayRange = (dateInput) => {
  let start = new Date();
  start.setHours(0, 0, 0, 0);

  if (dateInput) {
    const [y, m, d] = String(dateInput)
      .split("-")
      .map((part) => parseInt(part, 10));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      start = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

exports.add = async (req, res) => {
  try {
    await validateAttendanceData(req.body);
    const payload = { ...req.body };
    if (!payload.deviceId && payload.userId && mongoose.isValidObjectId(payload.userId)) {
      const device = await DeviceModel.findOne({ userId: payload.userId })
        .select("deviceId")
        .lean();
      if (device?.deviceId) {
        payload.deviceId = device.deviceId;
      }
    }
    const attendance = await AttendanceModel.create(payload);
    return res.status(201).json({
      status: true,
      message: "Attendance created successfully",
      data: attendance,
    });
  } catch (error) {
    if (error.errors) {
      return res.status(400).json({
        status: false,
        message: error.message || "Validation failed",
        errors: error.errors,
      });
    }
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const scopeFilter = await buildAttendanceScopeFilter(req);
    const {
      sectionAssigned,
      status,
      page,
      limit,
      search,
      date,
      action,
      name,
      employeeId,
      deviceId,
    } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);
    const limitNumber = Math.max(1, parseInt(limit, 10) || 10);
    const filter = {};
    const selectedLocation = String(req.query?.location || "").trim() || scope.location || "";
    if (sectionAssigned) filter.sectionAssigned = sectionAssigned;
    if (date) {
      const { start, end } = await getAttendanceWindowRange(date, selectedLocation);
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { entryGateIn: { $gte: start, $lt: end } },
            { exitGateOut: { $gte: start, $lt: end } },
            { updatedAt: { $gte: start, $lt: end } },
            { createdAt: { $gte: start, $lt: end } },
            { date: { $gte: start, $lt: end } },
          ],
        },
      ];
    }
    if (status === "approved") {
      filter.hrApproved = true;
      filter.supervisorApproved = true;
    }
    if (employeeId) {
      filter.employeeId = new RegExp(String(employeeId).trim(), "i");
    }
    if (deviceId) {
      filter.$or = [
        { deviceId: new RegExp(String(deviceId).trim(), "i") },
        { "metadata.deviceId": new RegExp(String(deviceId).trim(), "i") },
        { "metadata.device.deviceId": new RegExp(String(deviceId).trim(), "i") },
        { "metadata.device.id": new RegExp(String(deviceId).trim(), "i") },
      ];
    }

    const searchTerm = String(search || "").trim().toLowerCase();
    const nameTerm = String(name || "").trim().toLowerCase();
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (normalizedAction === "login" || normalizedAction === "logout") {
      const sessionFilter = {};
      if (date) {
        const { start, end } = getDayRange(date);
        sessionFilter.createdAt = { $gte: start, $lt: end };
      }
      if (employeeId) {
        sessionFilter.employeeId = new RegExp(String(employeeId).trim(), "i");
      }
      if (deviceId) {
        sessionFilter.deviceId = new RegExp(String(deviceId).trim(), "i");
      }
      sessionFilter.action = normalizedAction === "login" ? "Logged In" : "Logout";

      const sessionRecords = await UserSession.find(
        withScopeFilter(sessionFilter, scopeFilter)
      )
        .sort({ createdAt: -1, _id: -1 })
        .lean();

      const employeeIds = Array.from(
        new Set(sessionRecords.map((r) => r.employeeId).filter(Boolean))
      );
      const userIds = Array.from(
        new Set(
          sessionRecords
            .map((r) => (r.userId ? String(r.userId) : ""))
            .filter(Boolean)
        )
      );

      const [employees, visitors, users, userDevices, employeeDevices] = await Promise.all([
        employeeIds.length > 0
          ? EmployeeModel.find({ employeeId: { $in: employeeIds } })
            .select("name employeeId userId deviceId location")
            .lean()
          : [],
        employeeIds.length > 0
          ? VisitorModel.find({ employeeId: { $in: employeeIds } })
            .select("name employeeId userId deviceId location")
            .lean()
          : [],
        userIds.length > 0
          ? UserModel.find({ _id: { $in: userIds } })
            .select("name fullName fullname username")
            .lean()
          : [],
        userIds.length > 0
          ? DeviceModel.find({ userId: { $in: userIds }, verified: { $ne: false } })
            .select("userId employeeId deviceId")
            .lean()
          : [],
        employeeIds.length > 0
          ? DeviceModel.find({ employeeId: { $in: employeeIds }, verified: { $ne: false } })
            .select("userId employeeId deviceId")
            .lean()
          : [],
      ]);

      const employeeMap = new Map();
      const employeeDeviceMap = new Map();
      const employeeLocationMap = new Map();
      employees.forEach((emp) => {
        if (emp?.employeeId) {
          employeeMap.set(String(emp.employeeId), emp.name || "");
          employeeLocationMap.set(String(emp.employeeId), emp.location || "");
        }
        if (emp?.deviceId) {
          employeeDeviceMap.set(String(emp.employeeId), emp.deviceId);
        }
      });
      visitors.forEach((vis) => {
        if (!employeeMap.has(String(vis.employeeId))) {
          employeeMap.set(String(vis.employeeId), vis.name || "");
        }
        if (!employeeLocationMap.has(String(vis.employeeId))) {
          employeeLocationMap.set(String(vis.employeeId), vis.location || "");
        }
        if (vis?.deviceId && !employeeDeviceMap.has(String(vis.employeeId))) {
          employeeDeviceMap.set(String(vis.employeeId), vis.deviceId);
        }
      });

      const userMap = new Map();
      users.forEach((user) => {
        const resolvedName =
          user.name || user.fullName || user.fullname || user.username || "";
        userMap.set(String(user._id), resolvedName);
      });

      const userDeviceMap = new Map();
      userDevices.forEach((device) => {
        if (device?.userId && device?.deviceId) {
          userDeviceMap.set(String(device.userId), device.deviceId);
        }
        if (device?.employeeId && device?.deviceId && !employeeDeviceMap.has(String(device.employeeId))) {
          employeeDeviceMap.set(String(device.employeeId), device.deviceId);
        }
      });
      employeeDevices.forEach((device) => {
        if (device?.employeeId && device?.deviceId) {
          employeeDeviceMap.set(String(device.employeeId), device.deviceId);
        }
        if (device?.userId && device?.deviceId && !userDeviceMap.has(String(device.userId))) {
          userDeviceMap.set(String(device.userId), device.deviceId);
        }
      });

      const filteredRows = sessionRecords
        .map((record) => {
          const userName =
            (record.userId && userMap.get(String(record.userId))) ||
            (record.employeeId && employeeMap.get(String(record.employeeId))) ||
            "";
          const resolvedDeviceId =
            record.deviceId ||
            (record.userId ? userDeviceMap.get(String(record.userId)) : "") ||
            (record.employeeId ? employeeDeviceMap.get(String(record.employeeId)) : "") ||
            "";
          const resolvedLocation =
            record.location ||
            (record.employeeId ? employeeLocationMap.get(String(record.employeeId)) : "") ||
            "";

          return {
            ...record,
            id: record._id?.toString?.() || "",
            userName,
            deviceId: resolvedDeviceId,
            location: resolvedLocation,
            action: normalizedAction,
            actionTime: record.createdAt || null,
            statusLabel: normalizedAction === "logout" ? "Logged Out" : "Logged In",
          };
        })
        .filter((row) => {
          if (nameTerm && !String(row.userName || "").toLowerCase().includes(nameTerm)) {
            return false;
          }
          if (!searchTerm) return true;
          const haystack = [
            row.userName,
            row.employeeId,
            row.deviceId,
            row.location,
            row.statusLabel,
            row.action,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(searchTerm);
        });

      const totalrecords = filteredRows.length;
      const paginatedRows = filteredRows.slice(
        pageNumber * limitNumber,
        pageNumber * limitNumber + limitNumber
      );

      return res.status(200).json({
        status: true,
        data: paginatedRows,
        total: totalrecords,
        pagination: {
          totalrecords,
          currentPage: pageNumber,
          totalPages: Math.max(1, Math.ceil(totalrecords / limitNumber)),
          limit: limitNumber,
        },
      });
    }

    if (normalizedAction === "login") {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { "metadata.action": "login" },
            { entryGateIn: { $exists: true, $ne: null } },
          ],
        },
      ];
    }
    if (normalizedAction === "logout") {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { "metadata.action": "logout" },
            { exitGateOut: { $exists: true, $ne: null } },
          ],
        },
      ];
    }

    const records = await AttendanceModel.find(withScopeFilter(filter, scopeFilter))
      .sort({ entryGateIn: -1, exitGateOut: -1, updatedAt: -1, _id: -1 })
      .lean();
    const employeeIds = Array.from(
      new Set(records.map((r) => r.employeeId).filter(Boolean))
    );
    const userIds = Array.from(
      new Set(
        records
          .map((r) => (r.userId ? String(r.userId) : ""))
          .filter(Boolean)
      )
    );

    const [employees, visitors, users, userDevices, employeeDevices] = await Promise.all([
      employeeIds.length > 0
        ? EmployeeModel.find({ employeeId: { $in: employeeIds } })
          .select("name employeeId userId deviceId")
          .lean()
        : [],
      employeeIds.length > 0
        ? VisitorModel.find({ employeeId: { $in: employeeIds } })
          .select("name employeeId userId")
          .lean()
        : [],
      userIds.length > 0
        ? UserModel.find({ _id: { $in: userIds } })
          .select("name fullName fullname username")
          .lean()
        : [],
      userIds.length > 0
        ? DeviceModel.find({ userId: { $in: userIds }, verified: { $ne: false } })
          .select("userId employeeId deviceId")
          .lean()
        : [],
      employeeIds.length > 0
        ? DeviceModel.find({ employeeId: { $in: employeeIds }, verified: { $ne: false } })
          .select("userId employeeId deviceId")
          .lean()
        : [],
    ]);

    const employeeMap = new Map();
    const employeeDeviceMap = new Map();
    employees.forEach((emp) => {
      employeeMap.set(String(emp.employeeId), emp.name || "");
      if (emp?.deviceId) {
        employeeDeviceMap.set(String(emp.employeeId), emp.deviceId);
      }
    });
    visitors.forEach((vis) => {
      if (!employeeMap.has(String(vis.employeeId))) {
        employeeMap.set(String(vis.employeeId), vis.name || "");
      }
    });

    const userMap = new Map();
    users.forEach((user) => {
      const name = user.name || user.fullName || user.fullname || user.username || "";
      userMap.set(String(user._id), name);
    });

    const deviceMap = new Map();
    userDevices.forEach((device) => {
      if (device?.userId && device?.deviceId) {
        deviceMap.set(String(device.userId), device.deviceId);
      }
      if (device?.employeeId && device?.deviceId && !employeeDeviceMap.has(String(device.employeeId))) {
        employeeDeviceMap.set(String(device.employeeId), device.deviceId);
      }
    });
    employeeDevices.forEach((device) => {
      if (device?.employeeId && device?.deviceId) {
        employeeDeviceMap.set(String(device.employeeId), device.deviceId);
      }
      if (device?.userId && device?.deviceId && !deviceMap.has(String(device.userId))) {
        deviceMap.set(String(device.userId), device.deviceId);
      }
    });

    // Normalize rows for UI consumption
    const dataWithId = records.map((doc) => {
      const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
      const userName =
        (plain.userId && userMap.get(String(plain.userId))) ||
        (plain.employeeId && employeeMap.get(String(plain.employeeId))) ||
        "";
      const deviceId =
        plain?.metadata?.deviceId ||
        plain?.metadata?.device?.deviceId ||
        plain?.metadata?.device?.id ||
        plain?.deviceId ||
        (plain.userId ? deviceMap.get(String(plain.userId)) : "") ||
        (plain.employeeId ? employeeDeviceMap.get(String(plain.employeeId)) : "") ||
        "";
      const rowAction =
        String(plain?.metadata?.action || "").toLowerCase() ||
        (plain.exitGateOut ? "logout" : plain.entryGateIn ? "login" : "");
      const actionTime =
        rowAction === "logout"
          ? plain.exitGateOut || plain.updatedAt || plain.createdAt || null
          : plain.entryGateIn || plain.createdAt || null;
      return {
        ...plain,
        id: plain._id?.toString?.() || plain.id,
        userName,
        deviceId,
        action: rowAction,
        actionTime,
        statusLabel:
          rowAction === "logout"
            ? "Logged Out"
            : rowAction === "login"
              ? "Logged In"
              : plain.status || "-",
      };
    });

    const filteredRows = dataWithId.filter((row) => {
      if (nameTerm && !String(row.userName || "").toLowerCase().includes(nameTerm)) {
        return false;
      }
      if (searchTerm) {
        const haystack = [
          row.userName,
          row.employeeId,
          row.deviceId,
          row.rfidCardId,
          row.sectionAssigned,
          row.remarks,
          row.statusLabel,
          row.action,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
      }
      return true;
    });

    const totalrecords = filteredRows.length;
    const paginatedRows = filteredRows.slice(
      pageNumber * limitNumber,
      pageNumber * limitNumber + limitNumber
    );

    return res.status(200).json({
      status: true,
      data: paginatedRows,
      total: totalrecords,
      pagination: {
        totalrecords,
        currentPage: pageNumber,
        totalPages: Math.max(1, Math.ceil(totalrecords / limitNumber)),
        limit: limitNumber,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

exports.getNotLoggedIn = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const { page, limit, search, date, location } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);
    const limitNumber = Math.max(1, parseInt(limit, 10) || 10);
    const searchTerm = String(search || "").trim().toLowerCase();
    const selectedLocation = String(location || "").trim() || scope.location || "";
    const { start, end } = await getAttendanceWindowRange(date, selectedLocation);

    const employeeFilter = {
      status: "Active",
      "systemAccess.loginEnabled": { $ne: false },
    };
    if (selectedLocation) {
      employeeFilter.location = selectedLocation;
    } else if (scope.isAdmin && scope.location) {
      employeeFilter.location = scope.location;
    }

    const employees = await EmployeeModel.find(employeeFilter)
      .select("name employeeId userId location deviceId status systemAccess")
      .lean();

    const employeeIds = employees.map((emp) => String(emp.employeeId || "")).filter(Boolean);
    const userIds = employees.map((emp) => (emp.userId ? String(emp.userId) : "")).filter(Boolean);

    const loginRecords = employeeIds.length > 0
      ? await UserSession.find({
        employeeId: { $in: employeeIds },
        action: "Logged In",
        createdAt: { $gte: start, $lt: end },
      })
        .select("employeeId")
        .lean()
      : [];

    const loggedInEmployeeIds = new Set(
      loginRecords.map((record) => String(record.employeeId || "")).filter(Boolean)
    );

    const [userDevices, employeeDevices] = await Promise.all([
      userIds.length > 0
        ? DeviceModel.find({ userId: { $in: userIds }, verified: { $ne: false } })
          .select("userId employeeId deviceId")
          .lean()
        : [],
      employeeIds.length > 0
        ? DeviceModel.find({ employeeId: { $in: employeeIds }, verified: { $ne: false } })
          .select("userId employeeId deviceId")
          .lean()
        : [],
    ]);

    const deviceMapByEmployeeId = new Map();
    const deviceMapByUserId = new Map();
    employees.forEach((emp) => {
      if (emp?.employeeId && emp?.deviceId) {
        deviceMapByEmployeeId.set(String(emp.employeeId), emp.deviceId);
      }
      if (emp?.userId && emp?.deviceId) {
        deviceMapByUserId.set(String(emp.userId), emp.deviceId);
      }
    });
    userDevices.forEach((device) => {
      if (device?.userId && device?.deviceId) {
        deviceMapByUserId.set(String(device.userId), device.deviceId);
      }
      if (device?.employeeId && device?.deviceId && !deviceMapByEmployeeId.has(String(device.employeeId))) {
        deviceMapByEmployeeId.set(String(device.employeeId), device.deviceId);
      }
    });
    employeeDevices.forEach((device) => {
      if (device?.employeeId && device?.deviceId) {
        deviceMapByEmployeeId.set(String(device.employeeId), device.deviceId);
      }
      if (device?.userId && device?.deviceId && !deviceMapByUserId.has(String(device.userId))) {
        deviceMapByUserId.set(String(device.userId), device.deviceId);
      }
    });

    const filteredRows = employees
      .filter((emp) => !loggedInEmployeeIds.has(String(emp.employeeId || "")))
      .map((emp) => {
        const verifiedDeviceId =
          deviceMapByEmployeeId.get(String(emp.employeeId || "")) ||
          (emp.userId ? deviceMapByUserId.get(String(emp.userId)) : "") ||
          "";

        return {
          id: String(emp._id),
          userName: emp.name || "",
          employeeId: emp.employeeId || "",
          location: emp.location || "",
          deviceId: verifiedDeviceId,
          action: "not_logged_in",
          actionTime: null,
          statusLabel: "Not Logged In",
        };
      })
      .filter((row) => Boolean(row.deviceId))
      .filter((row) => {
        if (!searchTerm) return true;
        const haystack = [row.userName, row.employeeId, row.location, row.deviceId, row.statusLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchTerm);
      });

    const totalrecords = filteredRows.length;
    const paginatedRows = filteredRows.slice(
      pageNumber * limitNumber,
      pageNumber * limitNumber + limitNumber
    );

    return res.status(200).json({
      status: true,
      data: paginatedRows,
      total: totalrecords,
      pagination: {
        totalrecords,
        currentPage: pageNumber,
        totalPages: Math.max(1, Math.ceil(totalrecords / limitNumber)),
        limit: limitNumber,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

exports.getbyid = async (req, res) => {
  try {
    const scopeFilter = await buildAttendanceScopeFilter(req);
    const { id } = req.params;

    if (!id || id === "undefined") {
      return res
        .status(400)
        .json({ status: false, message: "Attendance id is required" });
    }

    const query = mongoose.isValidObjectId(id)
      ? { _id: id }
      : { rfidCardId: id };

    const attendance = await AttendanceModel.findOne(
      withScopeFilter(query, scopeFilter)
    );
    if (!attendance) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res.status(200).json({
      status: true,
      message: "Record fetched",
      data: attendance,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const scopeFilter = await buildAttendanceScopeFilter(req);
    const { id } = req.params;
    if (!id || id === "undefined") {
      return res
        .status(400)
        .json({ status: false, message: "Attendance id is required" });
    }
    const updated = await AttendanceModel.findOneAndUpdate(
      withScopeFilter({ _id: id }, scopeFilter),
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!updated) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res.status(200).json({
      status: true,
      message: "Updated successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const scopeFilter = await buildAttendanceScopeFilter(req);
    let recordIds = req.body?.recordId || req.params?.id;
    if (!recordIds) {
      return res
        .status(404)
        .json({ status: false, message: "Record ID(s) not found" });
    }
    if (recordIds === "undefined") {
      return res
        .status(400)
        .json({ status: false, message: "Record ID(s) not found" });
    }
    if (typeof recordIds === "string") recordIds = [recordIds];
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Record ID(s) must be a non-empty string or array",
      });
    }

    const result = await AttendanceModel.deleteMany(
      withScopeFilter({ _id: { $in: recordIds } }, scopeFilter)
    );
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No matching records found" });
    }

    return res.status(200).json({
      status: true,
      message: `${result.deletedCount} record(s) deleted successfully`,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
