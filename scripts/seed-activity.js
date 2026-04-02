const path = require("path");
const mongoose = require("mongoose");
const Activity = require("../Modules/activity/model");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const MONGO_URI = process.env.MONGO_URI;
const USER_ID = "6948de1673c6f0ed1a460797";
const EMPLOYEE_ID = "EMP001";
const DEVICE_ID = "SP1A.210812.016";

const run = async () => {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI missing in environment");
  }

  await mongoose.connect(MONGO_URI);
  const now = new Date();

  const docs = [
    {
      userId: USER_ID,
      employeeId: EMPLOYEE_ID,
      deviceId: DEVICE_ID,
      category: "camera",
      activityType: "screenshot",
      title: "Screenshot",
      description: "User took screenshot",
      occurredAt: now,
      media: [
        {
          url: "https://picsum.photos/200?random=1",
          type: "screenshot",
          capturedAt: now,
        },
      ],
      metadata: { appName: "Camera" },
    },
    {
      userId: USER_ID,
      employeeId: EMPLOYEE_ID,
      deviceId: DEVICE_ID,
      category: "camera",
      activityType: "video",
      title: "Video",
      description: "User recorded video",
      occurredAt: new Date(now.getTime() - 60 * 60 * 1000),
      media: [
        {
          url: "https://picsum.photos/200?random=2",
          type: "video",
          capturedAt: new Date(now.getTime() - 60 * 60 * 1000),
        },
      ],
      metadata: { appName: "Camera" },
    },
    {
      userId: USER_ID,
      employeeId: EMPLOYEE_ID,
      deviceId: DEVICE_ID,
      category: "app_install",
      activityType: "app_install",
      title: "Pidilite",
      description: "App installed",
      occurredAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      metadata: { appName: "Pidilite" },
    },
    {
      userId: USER_ID,
      employeeId: EMPLOYEE_ID,
      deviceId: DEVICE_ID,
      category: "app_uninstall",
      activityType: "app_uninstall",
      title: "Pidilite",
      description: "App uninstalled",
      occurredAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      metadata: { appName: "Pidilite" },
    },
  ];

  await Activity.insertMany(docs);
  console.log(`✅ Seeded ${docs.length} activity logs`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Seeding failed:", err.message);
  process.exit(1);
});
