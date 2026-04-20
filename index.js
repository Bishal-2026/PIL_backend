const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const modulesPath = path.join(__dirname, "Modules");
const { UPLOAD_ROOT } = require("./middleware/upload");
const responseTimeLogger = require("./middleware/responseTimeLogger");
const cors = require("cors");
const userRoutes = require("./Modules/user/routes");
const EmployeeModel = require("./Modules/employees/model");
const { startDevicePresenceMonitor } = require("./helpers/devicePresenceMonitor");
const { startWorkingHoursCron } = require("./cron/workingHoursCheck");

const app = express();
app.use(express.json());
app.use(responseTimeLogger);
app.use((req, res, next) => {
  const start = Date.now();

  // Capture request data
  const { method, originalUrl, body, query } = req;
  console.log(`➡️ ${method} ${originalUrl}`);
  console.log("📦 Request body:", body);
  console.log("🔍 Query params:", query);

  // Hook into response end to get response time
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`✅ ${method} ${originalUrl} - ${res.statusCode} - ${duration}ms`);
    console.log("--------------------------------------------------");
  });

  next();
});
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:5000",
    "http://localhost:4001",
    "https://pidiliteapp.ajivainfotech.com",
    "https://pil.ajivainfotech.com"
  ],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type, Authorization",
  credentials: true,
  optionsSuccessStatus: 204,
};

const dropLegacyEmployeeIndexes = async () => {
  try {
    const collection = EmployeeModel.collection;
    const indexes = await collection.listIndexes().toArray();
    const legacy = indexes.filter((idx) => {
      if (!idx?.key) return false;
      return Object.keys(idx.key).some(
        (key) => key.startsWith("professional.") || key.startsWith("personal.")
      );
    });
    for (const idx of legacy) {
      await collection.dropIndex(idx.name);
      console.log(`✅ Dropped legacy index: ${idx.name}`);
    }
  } catch (error) {
    console.warn("⚠️ Legacy index cleanup skipped:", error.message);
  }
};

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");
    await dropLegacyEmployeeIndexes();
    startDevicePresenceMonitor();
    startWorkingHoursCron();
  })
  .catch((err) => console.log(err));

//=======================Middleware===============================//
app.use(cors(corsOptions));
app.use("/uploads", express.static(UPLOAD_ROOT));

// Explicit auth alias to user routes so frontend /api/auth/* continues to work
app.use("/api/auth", userRoutes);

fs.readdirSync(modulesPath).forEach((folder) => {
  const routePath = path.join(modulesPath, folder, "routes.js");

  // Check if the route file exists
  if (fs.existsSync(routePath)) {
    const route = require(routePath);

    // Mount route at /api/<folder-name>
    app.use(`/api/${folder.toLowerCase()}`, route);
    console.log(`✅ Loaded routes for: /api/${folder.toLowerCase()}`);

    // Aliases for client compatibility
    if (folder.toLowerCase() === "role") {
      app.use("/api/roles", route);
      console.log("✅ Alias added: /api/roles");
    }
    if (folder.toLowerCase() === "employees") {
      app.use("/api/employee", route);
      console.log("✅ Alias added: /api/employee");
    }
    if (folder.toLowerCase() === "dashboard") {
      app.use("/api/dashboard", route);
      console.log("✅ Alias added: /api/dashboard");
    }
  } else {
    console.warn(`⚠️ No routes.js found in: ${folder}`);
  }
});

// ======Start the server========================//
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
