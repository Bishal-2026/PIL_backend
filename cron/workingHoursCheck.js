const SettingsModel = require("../Modules/settings/model");
const DeviceModel = require("../Modules/device/model");
const DeviceEventModel = require("../Modules/device/deviceEventModel");
const UserModel = require("../Modules/user/model");
const VisitorModel = require("../Modules/user/visitorModel");
const EmployeeModel = require("../Modules/employees/model");
const AttendanceModel = require("../Modules/attendance/model");
const cron = require("node-cron");
const mongoose = require("mongoose");

/**
 * Checks for WORKING HOURS VIOLATIONS based on the LAST ACTION in Attendance records.
 * 
 * Logic:
 * 1. Fetch all Attendance records for the target day.
 * 2. Group by employeeId and find the LATEST record (by createdAt).
 * 3. If the latest record is a "Login" (not Logout), it's a violation.
 * 
 * Handling Location Mismatch:
 * Detects if employee location matches any enabled setting location (includes substring matching).
 */
const runWorkingHoursCheck = async (dryRun = false, customDate = null) => {
    console.log("🕒 Running Working Hours Violation Check (Last Action Attendance)...");
    const allEvents = [];

    try {
        // 1. Get enabled locations and their work end times
        const settingsList = await SettingsModel.find({ "workingHours.enabled": true }).lean();
        if (settingsList.length === 0) {
            console.log("ℹ️ No active working hours policies found in settings.");
            return [];
        }

        const enabledLocations = settingsList.map(s => ({
            name: s.unitLocation?.trim(),
            endTime: s.workingHours.endTime
        })).filter(l => l.name);

        // 2. Calculate Target Date Range
        let targetDate;
        if (customDate) {
            targetDate = new Date(customDate);
            console.log(`📅 Checking Custom Date: ${targetDate.toISOString().split('T')[0]}`);
        } else {
            const now = new Date();
            targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() - 1); // Yesterday
        }

        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        // 3. Fetch ALL Attendance records for the target day
        // We use createdAt to find records physically created during that day's window
        const attendanceRecords = await AttendanceModel.find({
            createdAt: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ createdAt: 1 }).lean(); // Sort ASC so we can find the "Last" easily

        if (attendanceRecords.length === 0) {
            console.log("✅ No attendance records found for this date.");
            return [];
        }

        // 4. Group by employeeId and find the LATEST action for each
        const latestActionsMap = {};
        for (const record of attendanceRecords) {
            const empId = record.employeeId;
            if (!empId) continue;

            const action = record.metadata?.action || (record.entryGateIn ? "login" : record.exitGateOut ? "logout" : "unknown");

            // Overwrite with newer record
            latestActionsMap[empId] = {
                action: action,
                timestamp: record.createdAt,
                recordId: record._id,
                userId: record.userId,
                location: record.location // Capture location from the attendance record itself
            };
        }

        // 5. Identify Violators (Last action = 'login')
        const potentialViolatorsIds = Object.keys(latestActionsMap).filter(empId => {
            return latestActionsMap[empId].action === "login";
        });

        if (potentialViolatorsIds.length === 0) {
            console.log("✅ Everyone who logged in also logged out today.");
            return [];
        }

        // 6. Resolve Employee/Visitor Information & Filter by Location Policy
        const [userDetails, visitorDetails, employeeDetails] = await Promise.all([
            UserModel.find({ employeeId: { $in: potentialViolatorsIds } }).select("name employeeId location").lean(),
            VisitorModel.find({ employeeId: { $in: potentialViolatorsIds } }).select("name employeeId location").lean(),
            EmployeeModel.find({ employeeId: { $in: potentialViolatorsIds } }).select("name employeeId location").lean()
        ]);

        const personMap = {};
        const collect = (arr, type) => {
            arr.forEach(p => {
                personMap[p.employeeId] = {
                    name: p.name,
                    type: type,
                    location: p.location?.trim() || "",
                    id: p._id
                };
            });
        };

        collect(userDetails, "Employee");
        collect(visitorDetails, "Visitor");
        collect(employeeDetails, "Employee"); // Prioritize Employee model/name if duplicate

        const violationsToLog = [];
        const violationTimestamp = new Date(targetDate);
        violationTimestamp.setHours(23, 59, 59, 999);

        for (const empId of potentialViolatorsIds) {
            const person = personMap[empId] || { name: "Unknown", type: "Unknown", location: "" };

            let matchingPolicy = null;

            if (person.location) {
                // 1. Try strict/fuzzy match if person HAS a location in their profile
                matchingPolicy = enabledLocations.find(loc => {
                    const pLoc = person.location.toLowerCase();
                    const sLoc = loc.name.toLowerCase();
                    return pLoc === sLoc || pLoc.includes(sLoc) || sLoc.includes(pLoc);
                });
            } else {
                // 2. FALLBACK: If the person has NO location set in their profile,
                // check them against the first available active policy (e.g., Mumbai).
                // This ensures we catch violations even for misconfigured users.
                matchingPolicy = enabledLocations[0];
            }

            if (!matchingPolicy) {
                // No working hours policy found or available
                continue;
            }

            // 7. Create Violation Event
            // Find device for this user
            const device = await DeviceModel.findOne({
                $or: [
                    { userId: person.id },
                    { employeeId: empId }
                ]
            }).select("_id deviceId").lean();

            violationsToLog.push({
                deviceId: device?._id || new mongoose.Types.ObjectId(),
                event: "Working Hours Violation",
                name: person.name,
                employeeId: empId,
                timestamp: violationTimestamp,
                policyVoilation: true,
                metadata: {
                    reason: "working_hours_violation",
                    description: "User Not logged Out",
                    location: latestActionsMap[empId].location || person.location || matchingPolicy.name,
                    expectedLogoutBefore: matchingPolicy.endTime,
                    checkDate: targetDate.toISOString().split('T')[0],
                    userType: person.type,
                    deviceId: device?.deviceId || "No Device Linked",
                    lastActionAt: latestActionsMap[empId].timestamp
                },
                raw: {
                    autoGenerated: true,
                    location: latestActionsMap[empId].location || person.location || matchingPolicy.name,
                    lastAction: latestActionsMap[empId].action,
                    lastActionAt: latestActionsMap[empId].timestamp,
                    source: "AttendanceMonitor"
                }
            });
        }
        // 8. Save or Log
        if (violationsToLog.length > 0) {
            if (dryRun) {
                console.log(`🔎 Dry Run: Found ${violationsToLog.length} violations:`);
                // console.log(JSON.stringify(violationsToLog, null, 2));
                allEvents.push(...violationsToLog);
            } else {
                await DeviceEventModel.insertMany(violationsToLog);
                console.log(`✅ Saved ${violationsToLog.length} violations to database.`);
                allEvents.push(...violationsToLog);
            }
        } else {
            console.log("✅ Found potential violators but none matched an active location policy.");
        }

    } catch (error) {
        console.error("❌ Working Hours Check Error:", error);
    }

    return allEvents;
};

const startWorkingHoursCron = () => {
    // Schedule to run at 00:05 daily
    cron.schedule("5 0 * * *", () => {
        runWorkingHoursCheck();
    });
    console.log("✅ Working Hours Cron Scheduled for 00:05 daily");
};

module.exports = { startWorkingHoursCron, runWorkingHoursCheck };
