const Contractor = require("../contractors/model");
const Employee = require("../employees/model");
const Section = require("../sections/model");
const Attendance = require("../attendance/model");
const Visitor = require("../user/visitorModel");
const VisitorLog = require("../visitorLogs/model");
const DeviceEvent = require("../device/deviceEventModel");
const Settings = require("../settings/model");
const { resolveLocationScope } = require("../../helpers/locationScope");

const buildLocationFallbackFilter = (location) => ({
  $or: [
    { location },
    { unitLocation: location },
    { "metadata.location": location },
    { "metadata.unitLocation": location },
  ],
});

const otpGateFilter = { $or: [{ otpVerified: true }, { otpVerified: { $exists: false } }] };

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
  const fallbackStart = parseTimeToMinutes(
    DEFAULT_ATTENDANCE_WINDOW.startTime,
    6 * 60
  );
  const fallbackEnd = parseTimeToMinutes(
    DEFAULT_ATTENDANCE_WINDOW.endTime,
    7 * 60 + 30
  );
  const normalizedLocation = String(location || "").trim();

  if (!normalizedLocation) {
    return {
      startMinutes: fallbackStart,
      endMinutes: fallbackEnd,
      spansNextDay: DEFAULT_ATTENDANCE_WINDOW.spansNextDay,
    };
  }

  const settings = await Settings.findOne({ unitLocation: normalizedLocation })
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

  return {
    startMinutes,
    endMinutes,
    spansNextDay,
  };
};

const buildAttendanceWindowRange = (anchorDate, windowConfig) => {
  const start = getDateAtMinutes(anchorDate, windowConfig.startMinutes);
  const end = getDateAtMinutes(anchorDate, windowConfig.endMinutes);
  if (windowConfig.spansNextDay) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
};

const countAttendanceInWindow = (records = [], windowStart, windowEnd) => {
  let loggedIn = 0;
  let loggedOut = 0;

  records.forEach((record) => {
    const entryTime = record?.entryGateIn ? new Date(record.entryGateIn) : null;
    const exitTime = record?.exitGateOut ? new Date(record.exitGateOut) : null;

    if (entryTime && !Number.isNaN(entryTime.getTime())) {
      if (entryTime >= windowStart && entryTime < windowEnd) {
        loggedIn += 1;
      }
    }

    if (exitTime && !Number.isNaN(exitTime.getTime())) {
      if (exitTime >= windowStart && exitTime < windowEnd) {
        loggedOut += 1;
      }
    }

    if (!entryTime && !exitTime) {
      const fallbackTime = record?.updatedAt || record?.createdAt || record?.date;
      const action = String(record?.metadata?.action || "").trim().toLowerCase();
      const actionTime = fallbackTime ? new Date(fallbackTime) : null;
      if (
        actionTime &&
        !Number.isNaN(actionTime.getTime()) &&
        actionTime >= windowStart &&
        actionTime < windowEnd
      ) {
        if (action === "login") loggedIn += 1;
        if (action === "logout") loggedOut += 1;
      }
    }
  });

  return { loggedIn, loggedOut };
};

const buildTodayActionCounts = async (attendanceFilter = {}, location = "") => {
  const windowConfig = await resolveAttendanceWindowConfig(location);
  const { start, end } = buildAttendanceWindowRange(new Date(), windowConfig);

  const records = await Attendance.find({
    ...attendanceFilter,
    $or: [
      { entryGateIn: { $gte: start, $lt: end } },
      { exitGateOut: { $gte: start, $lt: end } },
      { updatedAt: { $gte: start, $lt: end } },
      { createdAt: { $gte: start, $lt: end } },
      { date: { $gte: start, $lt: end } },
    ],
  })
    .select("date createdAt updatedAt entryGateIn exitGateOut metadata.action")
    .lean();

  const result = countAttendanceInWindow(records, start, end);

  return {
    todayLoggedIn: result.loggedIn || 0,
    todayLoggedOut: result.loggedOut || 0,
  };
};

const buildLatestSessionCounts = async (attendanceFilter = {}) => {
  const [result] = await Attendance.aggregate([
    {
      $match: {
        ...attendanceFilter,
        employeeId: { $exists: true, $ne: null, $ne: "" },
      },
    },
    {
      $addFields: {
        normalizedAction: {
          $toLower: {
            $trim: {
              input: { $ifNull: ["$metadata.action", ""] },
            },
          },
        },
        actionTime: {
          $ifNull: [
            "$exitGateOut",
            {
              $ifNull: [
                "$entryGateIn",
                {
                  $ifNull: [
                    "$updatedAt",
                    {
                      $ifNull: ["$createdAt", "$date"],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        resolvedAction: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$normalizedAction", "login"] },
                then: "login",
              },
              {
                case: { $eq: ["$normalizedAction", "logout"] },
                then: "logout",
              },
              {
                case: { $ne: ["$exitGateOut", null] },
                then: "logout",
              },
              {
                case: { $ne: ["$entryGateIn", null] },
                then: "login",
              },
            ],
            default: "",
          },
        },
      },
    },
    {
      $match: {
        resolvedAction: { $in: ["login", "logout"] },
      },
    },
    {
      $sort: {
        employeeId: 1,
        actionTime: -1,
        updatedAt: -1,
        createdAt: -1,
        _id: -1,
      },
    },
    {
      $group: {
        _id: "$employeeId",
        latestAction: { $first: "$resolvedAction" },
      },
    },
    {
      $group: {
        _id: null,
        loggedIn: {
          $sum: {
            $cond: [{ $eq: ["$latestAction", "login"] }, 1, 0],
          },
        },
        loggedOut: {
          $sum: {
            $cond: [{ $eq: ["$latestAction", "logout"] }, 1, 0],
          },
        },
      },
    },
  ]);

  return {
    loggedIn: result?.loggedIn || 0,
    loggedOut: result?.loggedOut || 0,
  };
};

// Dashboard summary counts for cards
exports.getSummary = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);

    if (scope.isAdmin) {
      const location = scope.location;
      const [employeesAtLocation, visitorsAtLocation] = await Promise.all([
        Employee.find({ location, ...otpGateFilter }).select("employeeId").lean(),
        Visitor.find({ location, ...otpGateFilter }).select("employeeId").lean(),
      ]);

      const scopedEmployeeIds = Array.from(
        new Set(
          [...employeesAtLocation, ...visitorsAtLocation]
            .map((doc) => String(doc?.employeeId || "").trim())
            .filter(Boolean)
        )
      );

      const attendanceFilter = scopedEmployeeIds.length
        ? { employeeId: { $in: scopedEmployeeIds } }
        : { _id: { $in: [] } };

      const deviceEventFilter = scopedEmployeeIds.length
        ? { employeeId: { $in: scopedEmployeeIds }, policyVoilation: true }
        : { _id: { $in: [] }, policyVoilation: true };

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const todayDeviceEventFilter = {
        ...deviceEventFilter,
        timestamp: { $gte: startOfDay, $lte: endOfDay }
      };

      const [contractors, employees, visitors, managers, departments, monthlyReports, totalActivities, todayActivities] =
        await Promise.all([
          Contractor.countDocuments(buildLocationFallbackFilter(location)),
          Employee.countDocuments({ location, ...otpGateFilter }),
          VisitorLog.countDocuments({ location, status: "Approved" }),
          Employee.countDocuments({ role: "manager", location }),
          Section.countDocuments(buildLocationFallbackFilter(location)),
          Attendance.countDocuments(attendanceFilter),
          DeviceEvent.countDocuments(deviceEventFilter),
          DeviceEvent.countDocuments(todayDeviceEventFilter),
        ]);

      const windowConfig = await resolveAttendanceWindowConfig(location);
      const [{ loggedIn, loggedOut }, { todayLoggedIn, todayLoggedOut }] = await Promise.all([
        buildLatestSessionCounts(attendanceFilter),
        buildTodayActionCounts(attendanceFilter, location),
      ]);

      const firstAnchorDate = new Date();
      firstAnchorDate.setHours(0, 0, 0, 0);
      firstAnchorDate.setDate(firstAnchorDate.getDate() - 6);
      const { start: sevenDayWindowStart } = buildAttendanceWindowRange(firstAnchorDate, windowConfig);
      const { end: latestWindowEnd } = buildAttendanceWindowRange(new Date(), windowConfig);

      const recentAttendanceInfo = await Attendance.find({
        ...attendanceFilter,
        $or: [
          { entryGateIn: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
          { exitGateOut: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
          { updatedAt: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
          { createdAt: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
          { date: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
        ],
      }).select("date createdAt updatedAt entryGateIn exitGateOut metadata.action").lean();

      const last7DaysAttendance = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const dL = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const { start: windowStart, end: windowEnd } = buildAttendanceWindowRange(d, windowConfig);
        const { loggedIn: loggedInCount, loggedOut: loggedOutCount } =
          countAttendanceInWindow(recentAttendanceInfo, windowStart, windowEnd);

      last7DaysAttendance.push({
        name: dL,
        fullDate: d.toISOString(),
        loggedIn: loggedInCount,
        loggedOut: loggedOutCount
      });
      }

      return res.status(200).json({
        status: true,
        data: {
          contractors,
          employees,
          visitors,
          managers,
          departments,
          monthlyReports,
          totalActivities,
          todayActivities,
          loggedIn,
          loggedOut,
          todayLoggedIn,
          todayLoggedOut,
          last7DaysAttendance
        },
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todayDeviceEventFilter = {
      policyVoilation: true,
      timestamp: { $gte: startOfDay, $lte: endOfDay }
    };

    const [contractors, employees, visitors, managers, departments, monthlyReports, totalActivities, todayActivities] =
      await Promise.all([
        Contractor.countDocuments({}),
        Employee.countDocuments({ ...otpGateFilter }),
        VisitorLog.countDocuments({ status: "Approved" }),
        Employee.countDocuments({ role: "manager" }),
        Section.countDocuments({}),
        Attendance.countDocuments({}), // treating attendance entries as monthly reports
        DeviceEvent.countDocuments({ policyVoilation: true }),
        DeviceEvent.countDocuments(todayDeviceEventFilter),
      ]);

    const windowConfig = await resolveAttendanceWindowConfig();
    const [{ loggedIn, loggedOut }, { todayLoggedIn, todayLoggedOut }] = await Promise.all([
      buildLatestSessionCounts(),
      buildTodayActionCounts(),
    ]);

    const firstAnchorDate = new Date();
    firstAnchorDate.setHours(0, 0, 0, 0);
    firstAnchorDate.setDate(firstAnchorDate.getDate() - 6);
    const { start: sevenDayWindowStart } = buildAttendanceWindowRange(firstAnchorDate, windowConfig);
    const { end: latestWindowEnd } = buildAttendanceWindowRange(new Date(), windowConfig);

    const recentAttendanceInfo = await Attendance.find({
      $or: [
        { entryGateIn: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
        { exitGateOut: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
        { updatedAt: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
        { createdAt: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
        { date: { $gte: sevenDayWindowStart, $lt: latestWindowEnd } },
      ],
    }).select("date createdAt updatedAt entryGateIn exitGateOut metadata.action").lean();

    const last7DaysAttendance = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const dL = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const { start: windowStart, end: windowEnd } = buildAttendanceWindowRange(d, windowConfig);
      const { loggedIn: loggedInCount, loggedOut: loggedOutCount } =
        countAttendanceInWindow(recentAttendanceInfo, windowStart, windowEnd);

      last7DaysAttendance.push({
        name: dL,
        fullDate: d.toISOString(),
        loggedIn: loggedInCount,
        loggedOut: loggedOutCount
      });
    }

    return res.status(200).json({
      status: true,
      data: {
        contractors,
        employees,
        visitors,
        managers,
        departments,
        monthlyReports,
        totalActivities,
        todayActivities,
        loggedIn,
        loggedOut,
        todayLoggedIn,
        todayLoggedOut,
        last7DaysAttendance
      },
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
