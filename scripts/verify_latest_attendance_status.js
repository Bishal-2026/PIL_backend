const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const Attendance = require("../Modules/attendance/model");
const Employee = require("../Modules/employees/model");
const Visitor = require("../Modules/user/visitorModel");

const otpGateFilter = {
  $or: [{ otpVerified: true }, { otpVerified: { $exists: false } }],
};

const getArgValue = (flag) => {
  const direct = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1);

  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return "";
};

const buildScopedEmployeeIds = async (location) => {
  if (!location) return [];

  const [employees, visitors] = await Promise.all([
    Employee.find({ location, ...otpGateFilter }).select("employeeId").lean(),
    Visitor.find({ location, ...otpGateFilter }).select("employeeId").lean(),
  ]);

  return Array.from(
    new Set(
      [...employees, ...visitors]
        .map((doc) => String(doc?.employeeId || "").trim())
        .filter(Boolean)
    )
  );
};

const buildLatestStatusPipeline = (attendanceFilter) => [
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
      latestAt: { $first: "$actionTime" },
      recordId: { $first: "$_id" },
    },
  },
  {
    $facet: {
      counts: [
        {
          $group: {
            _id: null,
            loggedIn: {
              $sum: { $cond: [{ $eq: ["$latestAction", "login"] }, 1, 0] },
            },
            loggedOut: {
              $sum: { $cond: [{ $eq: ["$latestAction", "logout"] }, 1, 0] },
            },
            totalUsers: { $sum: 1 },
          },
        },
      ],
    },
  },
];

const main = async () => {
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/inout360";
  const location = String(getArgValue("--location") || "").trim();

  await mongoose.connect(mongoUri);

  const scopedEmployeeIds = await buildScopedEmployeeIds(location);
  const attendanceFilter = location
    ? scopedEmployeeIds.length > 0
      ? { employeeId: { $in: scopedEmployeeIds } }
      : { _id: { $in: [] } }
    : {};

  const [result] = await Attendance.aggregate(
    buildLatestStatusPipeline(attendanceFilter)
  );

  const counts = result?.counts?.[0] || {
    loggedIn: 0,
    loggedOut: 0,
    totalUsers: 0,
  };

  console.log("=== Latest Attendance Status Verification ===");
  console.log("Location:", location || "ALL");
  if (location) {
    console.log("Scoped employee IDs:", scopedEmployeeIds.length);
  }
  console.log("Logged In:", counts.loggedIn || 0);
  console.log("Logged Out:", counts.loggedOut || 0);
  console.log("Total Users Counted:", counts.totalUsers || 0);

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("Verification failed:", error);
  try {
    await mongoose.disconnect();
  } catch (_error) {
    // noop
  }
  process.exit(1);
});
