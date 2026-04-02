const DeviceModel = require("../Modules/device/model");

const CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute
const OFFLINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

let timer = null;
let running = false;
let DeviceEventModel = null;

const runCheck = async () => {
  if (running) return;
  running = true;
  if (!DeviceEventModel) {
    try {
      DeviceEventModel = require("../Modules/device/deviceEventModel");
    } catch (e) {
      console.warn("DeviceEventModel not loaded in monitor");
    }
  }

  try {
    const cutoff = new Date(Date.now() - OFFLINE_TIMEOUT_MS);

    // Find devices that are about to be marked offline to log events
    const devicesToOffline = await DeviceModel.find({
      status: "ONLINE",
      lastSeen: { $lte: cutoff },
    }).select("_id deviceId userId employeeId name").lean();

    // 🔴 FIX: Filter out users who are already logged out
    // We need to check the sessionStatus of the associated User (or Visitor)
    // Assuming devicesToOffline isn't huge, we can do this efficiently.
    const userIds = devicesToOffline.map(d => d.userId).filter(Boolean);

    // Fetch session status for these users
    // We need to import UserModel if not already imported, but let's check
    // If not, we should dynamic require it like DeviceEventModel or correct the imports.
    // However, top-level imports are better if no circular dependency.
    // Let's use dynamic require for safety in this existing pattern or just standard require if safe.

    // Check if UserModel is needed. 
    // Ideally we should just update the query to include user population, 
    // but a separate query is often cleaner for "find" with conditions on related docs in Mongo/Mongoose without aggregation.

    const UserModel = require("../Modules/user/model");
    const activeUsers = await UserModel.find({
      _id: { $in: userIds },
      sessionStatus: "Logged In"
    }).select("_id").lean();

    const activeUserIds = new Set(activeUsers.map(u => u._id.toString()));

    // Filter the list to only include devices belonging to currently logged-in users
    const validDevicesToOffline = devicesToOffline.filter(d =>
      // If no userId, we assume it's a device we should track (or not? let's be safe and track)
      // But typically a device has a user. If d.userId exists, distinct check.
      !d.userId || activeUserIds.has(d.userId.toString())
    );

    if (validDevicesToOffline.length > 0) {
      const bulkOps = validDevicesToOffline.map(d => ({
        updateOne: {
          filter: { _id: d._id },
          update: {
            $set: {
              status: "OFFLINE",
              "metadata.appState": "inactive_timeout",
              "metadata.inactiveAt": new Date(),
            }
          }
        }
      }));

      await DeviceModel.bulkWrite(bulkOps);

      // Log events for dashboard notification
      if (DeviceEventModel) {
        const events = validDevicesToOffline.map(d => ({
          deviceId: d._id,
          event: "User's Device is Inactive",
          name: d.name || "Unknown",
          employeeId: d.employeeId || "",
          timestamp: new Date(),
          policyVoilation: true,
          metadata: {
            reason: "inactive_timeout",
            deviceId: d.deviceId,
            lastSeen: d.lastSeen
          },
          raw: { autoBlocked: true }
        }));
        await DeviceEventModel.insertMany(events);
      }

      console.log(`[Monitor] Marked ${validDevicesToOffline.length} devices as OFFLINE`);
    }

  } catch (error) {
    console.error("Device presence monitor error:", error.message);
  } finally {
    running = false;
  }
};

const startDevicePresenceMonitor = () => {
  if (timer) return;
  timer = setInterval(runCheck, CHECK_INTERVAL_MS);
};

module.exports = { startDevicePresenceMonitor };
