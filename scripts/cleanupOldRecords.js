require("dotenv").config();
const mongoose = require("mongoose");

const AttendanceModel = require("../Modules/attendance/model");
const DeviceEventModel = require("../Modules/device/deviceEventModel");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/inout360";
const DAYS_TO_KEEP = 2;

const getCutoffDate = (daysToKeep) => {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  return cutoff;
};

const runCleanup = async () => {
  const args = process.argv.slice(2);
  const shouldApply = args.includes("--apply");
  const cutoffDate = getCutoffDate(DAYS_TO_KEEP);

  try {
    console.log("Connecting to database...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected.");

    console.log(`Cutoff date: ${cutoffDate.toISOString()} (${DAYS_TO_KEEP} days retention)`);

    const attendanceFilter = { date: { $lt: cutoffDate } };
    const eventFilter = { timestamp: { $lt: cutoffDate } };

    const [attendanceCount, eventCount] = await Promise.all([
      AttendanceModel.countDocuments(attendanceFilter),
      DeviceEventModel.countDocuments(eventFilter),
    ]);

    console.log(`Attendance records older than ${DAYS_TO_KEEP} days: ${attendanceCount}`);
    console.log(`Device events older than ${DAYS_TO_KEEP} days: ${eventCount}`);

    if (!shouldApply) {
      console.log("Dry run only. No records were deleted.");
      console.log("Run with --apply to permanently delete these records.");
      return;
    }

    const [attendanceResult, eventResult] = await Promise.all([
      AttendanceModel.deleteMany(attendanceFilter),
      DeviceEventModel.deleteMany(eventFilter),
    ]);

    console.log(`Deleted attendance records: ${attendanceResult.deletedCount || 0}`);
    console.log(`Deleted device events: ${eventResult.deletedCount || 0}`);
    console.log("Cleanup completed.");
  } catch (error) {
    console.error("Cleanup failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
};

runCleanup();
