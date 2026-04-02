require('dotenv').config();
const mongoose = require('mongoose');
const { runWorkingHoursCheck } = require('../cron/workingHoursCheck');

// Adjust path if needed
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/inout360';

const runManualCheck = async () => {
    // Get date from command line args (if provided)
    const args = process.argv.slice(2);
    const customDate = args.find(a => !a.startsWith('--'));
    const isSaveMode = args.includes('--save');
    const dryRun = !isSaveMode;

    try {
        console.log("🔌 Connecting to Real Database...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected.");

        if (customDate) {
            console.log(`📅 Custom Date Provided: ${customDate}`);
        } else {
            console.log("📅 Checking for YESTERDAY (Default)");
        }

        if (dryRun) {
            console.log("🚀 Running Working Hours Check on REAL DATA (Dry Run Mode)...");
            console.log("ℹ️  This will NOT save any violations to the DB.");
        } else {
            console.log("🚀 Running Working Hours Check on REAL DATA (SAVE MODE)...");
            console.log("⚠️  Violations will be SAVED to the database.");
        }
        console.log("---------------------------------------------------");

        // Run with dryRun and customDate
        const events = await runWorkingHoursCheck(dryRun, customDate);

        console.log("---------------------------------------------------");
        if (events.length > 0) {
            console.log(`⚠️  Found ${events.length} violations in your real data from yesterday.`);
            // console.log(JSON.stringify(events, null, 2)); // Uncomment to see full details

            // Print a summary table
            console.table(events.map(e => ({
                Name: e.name,
                Type: e.metadata.userType,
                Location: e.raw.location,
                Reason: e.metadata.description
            })));
        } else {
            console.log("✅ No violations found in your real data from yesterday.");
            console.log("   (Everyone likely logged out correctly or no one worked yesterday)");
        }

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected.");
    }
};

runManualCheck();


// to run this node scripts/manualCheck.js YYYY-MM-DD
// node scripts/manualCheck.js 2026-02-18