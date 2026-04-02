require('dotenv').config();
const mongoose = require('mongoose');
const { runWorkingHoursCheck } = require('../cron/workingHoursCheck');
const UserSessionModel = require('../Modules/user/userSessionsModel');
const SettingsModel = require('../Modules/settings/model');
const EmployeeModel = require('../Modules/employees/model');
const DeviceEventModel = require("../Modules/device/deviceEventModel");

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/inout360'; // Adjust if needed

const runTest = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to DB");

        // 1. Setup Test Data
        const testLocation = "TestUnitLocation_CronCheck";
        const testEmployeeId = "EMP_TEST_CRON_001";

        // clean up previous test data
        await Promise.all([
            SettingsModel.deleteMany({ unitLocation: testLocation }),
            EmployeeModel.deleteMany({ employeeId: testEmployeeId }),
            UserSessionModel.deleteMany({ employeeId: testEmployeeId }),
            DeviceEventModel.deleteMany({ employeeId: testEmployeeId })
        ]);

        // Create Settings
        await SettingsModel.create({
            unitLocation: testLocation,
            workingHours: {
                enabled: true,
                startTime: "09:00",
                endTime: "18:00"
            }
        });

        // Create Employee
        await EmployeeModel.create({
            employeeId: testEmployeeId,
            name: "Test User Cron",
            location: testLocation,
            department: "Testing"
        });

        // Create Session for YESTERDAY
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(10, 0, 0, 0); // Logged in at 10 AM yesterday

        await UserSessionModel.create({
            employeeId: testEmployeeId,
            userId: new mongoose.Types.ObjectId(), // Fake user ID
            action: "Logged In",
            createdAt: yesterday
        });

        console.log("✅ Test Data Created. User 'Logged In' yesterday but never logged out.");

        // 2. Run the Cron Function (DRY RUN)
        console.log("🚀 Running Cron Check (Dry Run)...");
        const events = await runWorkingHoursCheck(true);

        // 3. Verify
        const relevantEvent = events.find(e => e.employeeId === testEmployeeId && e.event === "Working Hours Violation");

        if (relevantEvent) {
            console.log("✅ SUCCESS: Violation correctly detected in Dry Run!");
            console.log(JSON.stringify(relevantEvent, null, 2));
        } else {
            console.error("❌ FAILURE: No violation detected in Dry Run.");
            console.log("Total events returned:", events.length);
        }

        // Cleanup
        await Promise.all([
            SettingsModel.deleteMany({ unitLocation: testLocation }),
            EmployeeModel.deleteMany({ employeeId: testEmployeeId }),
            UserSessionModel.deleteMany({ employeeId: testEmployeeId }),
            DeviceEventModel.deleteMany({ employeeId: testEmployeeId })
        ]);
        console.log("✅ Cleanup Done");

    } catch (error) {
        console.error("❌ Test Error:", error);
    } finally {
        await mongoose.disconnect();
    }
};

runTest();
