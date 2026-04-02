const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const Employee = require("../Modules/employees/model");
const Device = require("../Modules/device/model");

const getArgValue = (flag) => {
  const direct = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1);

  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return "";
};

const normalizeTag = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const parseTags = (value) =>
  Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map(normalizeTag)
        .filter(Boolean)
    )
  );

const main = async () => {
  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/inout360";
  const location = String(getArgValue("--location") || "").trim();
  const tags = parseTags(getArgValue("--tags"));

  await mongoose.connect(mongoUri);

  const employeeFilter = {
    tag: { $exists: true, $ne: "" },
    status: "Active",
  };
  if (location) {
    employeeFilter.location = location;
  }
  if (tags.length) {
    employeeFilter.tag = { $in: tags };
  }

  const employees = await Employee.find(employeeFilter)
    .select("employeeId name tag location status")
    .sort({ employeeId: 1, _id: 1 })
    .lean();

  const employeeIds = employees
    .map((employee) => String(employee.employeeId || "").trim())
    .filter(Boolean);

  const devices = employeeIds.length
    ? await Device.find({ employeeId: { $in: employeeIds } })
      .select("employeeId deviceId fcmToken verified deviceStatus status platform appVersion updatedAt createdAt")
      .sort({ employeeId: 1, updatedAt: -1, _id: -1 })
      .lean()
    : [];

  const summary = devices.reduce(
    (acc, device) => {
      const hasToken = Boolean(String(device?.fcmToken || "").trim());
      if (hasToken) acc.devicesWithToken += 1;
      else acc.devicesWithoutToken += 1;

      if (device?.verified === false) acc.unverifiedDevices += 1;
      else acc.verifiedDevices += 1;

      if (String(device?.deviceStatus || "") === "Disable") acc.disabledDevices += 1;
      else acc.enabledDevices += 1;

      return acc;
    },
    {
      totalDevices: devices.length,
      devicesWithToken: 0,
      devicesWithoutToken: 0,
      verifiedDevices: 0,
      unverifiedDevices: 0,
      enabledDevices: 0,
      disabledDevices: 0,
    }
  );

  console.log("=== Tagged Device Check ===");
  console.log("Location:", location || "ALL");
  console.log("Tags:", tags.length ? tags.join(", ") : "ALL TAGS");
  console.log("Matched Employees:", employees.length);
  console.log("Matched Devices:", summary.totalDevices);
  console.log("Devices With FCM Token:", summary.devicesWithToken);
  console.log("Devices Without FCM Token:", summary.devicesWithoutToken);
  console.log("Verified Devices:", summary.verifiedDevices);
  console.log("Unverified Devices:", summary.unverifiedDevices);
  console.log("Enabled Devices:", summary.enabledDevices);
  console.log("Disabled Devices:", summary.disabledDevices);

  console.log("\n=== Employees ===");
  console.table(
    employees.map((employee) => ({
      employeeId: employee.employeeId || "",
      name: employee.name || "",
      tag: employee.tag || "",
      location: employee.location || "",
      status: employee.status || "",
    }))
  );

  console.log("\n=== Devices ===");
  console.table(
    devices.map((device) => ({
      employeeId: device.employeeId || "",
      deviceId: device.deviceId || "",
      hasFcmToken: Boolean(String(device?.fcmToken || "").trim()),
      verified: device?.verified !== false,
      deviceStatus: device?.deviceStatus || "",
      status: device?.status || "",
      platform: device?.platform || "",
      appVersion: device?.appVersion || "",
      updatedAt: device?.updatedAt || null,
    }))
  );

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("Tagged device check failed:", error);
  try {
    await mongoose.disconnect();
  } catch (_error) {
    // noop
  }
  process.exit(1);
});
