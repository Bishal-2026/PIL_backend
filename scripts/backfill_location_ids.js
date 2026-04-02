require("dotenv").config();
const mongoose = require("mongoose");

const LocationModel = require("../Modules/location/model");
const SettingsModel = require("../Modules/settings/model");
const EmployeeModel = require("../Modules/employees/model");
const UserModel = require("../Modules/user/model");
const VisitorModel = require("../Modules/user/visitorModel");
const AttendanceModel = require("../Modules/attendance/model");
const DeviceModel = require("../Modules/device/model");
const fs = require("fs");
const path = require("path");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/inout360";
const TARGET_USER_ID = process.env.TARGET_USER_ID
  ? String(process.env.TARGET_USER_ID).trim()
  : "";

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const sanitizeFilename = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const buildLocationLookup = async () => {
  const locations = await LocationModel.find({})
    .select("_id name vendorCode aliases")
    .lean();

  const byName = new Map(); // nameKey -> loc
  const byVendorAndName = new Map(); // vendor|nameKey -> loc
  for (const loc of locations) {
    const canonicalName = String(loc?.name || "").trim();
    const canonicalKey = normalizeKey(canonicalName);
    const normalizedVendorCode = String(loc?.vendorCode || "").trim().toUpperCase();
    const record = { _id: loc._id, name: canonicalName, vendorCode: normalizedVendorCode };
    if (canonicalKey) byName.set(canonicalKey, record);
    if (canonicalKey && normalizedVendorCode) {
      byVendorAndName.set(`${normalizedVendorCode}|${canonicalKey}`, record);
    }
    const aliases = Array.isArray(loc?.aliases) ? loc.aliases : [];
    for (const alias of aliases) {
      const aliasKey = normalizeKey(alias);
      if (!aliasKey) continue;
      if (!byName.has(aliasKey)) byName.set(aliasKey, record);
      if (aliasKey && normalizedVendorCode) {
        const k = `${normalizedVendorCode}|${aliasKey}`;
        if (!byVendorAndName.has(k)) byVendorAndName.set(k, record);
      }
    }
  }
  return {
    resolve: (name, vendorCode) => {
      const nameKey = normalizeKey(name);
      if (!nameKey) return null;
      const normalizedVendorCode = String(vendorCode || "").trim().toUpperCase();
      if (normalizedVendorCode) {
        const hit = byVendorAndName.get(`${normalizedVendorCode}|${nameKey}`);
        if (hit) return hit;
      }
      return byName.get(nameKey) || null;
    },
    size: byName.size,
  };
};

const bulkBackfill = async ({
  label,
  Model,
  findFilter,
  getString,
  getVendorCode,
  buildUpdate,
  locationLookup,
  dryRun,
  limit,
  outputDir,
  summaryRows,
}) => {
  const docs = await Model.find(findFilter).limit(limit).lean();
  const ops = [];
  const unmatched = new Map();

  for (const doc of docs) {
    const raw = getString(doc);
    const key = normalizeKey(raw);
    const vendorCode = getVendorCode ? getVendorCode(doc) : "";
    const loc = key ? locationLookup.resolve(raw, vendorCode) : null;
    if (!loc?._id) {
      if (key) unmatched.set(key, (unmatched.get(key) || 0) + 1);
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: buildUpdate(doc, loc),
      },
    });
  }

  console.log(`\n== ${label} ==`);
  console.log(`Found: ${docs.length}, Matched: ${ops.length}, Unmatched: ${unmatched.size}`);
  if (unmatched.size) {
    const top = [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log("Top unmatched (value => count):");
    for (const [k, c] of top) console.log(`- ${k} => ${c}`);
  }
  if (outputDir && unmatched.size) {
    const payload = [...unmatched.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
    const file = path.join(outputDir, `unmatched_${sanitizeFilename(label)}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    if (Array.isArray(summaryRows)) {
      payload.forEach((row) => summaryRows.push({ label, ...row }));
    }
  }

  if (!ops.length) return { updated: 0, unmatched: unmatched.size };
  if (dryRun) {
    console.log("DRY_RUN enabled: not writing changes.");
    return { updated: 0, unmatched: unmatched.size };
  }

  const result = await Model.bulkWrite(ops, { ordered: false });
  const modified = result?.modifiedCount || 0;
  console.log(`Updated: ${modified}`);
  return { updated: modified, unmatched: unmatched.size };
};

const main = async () => {
  const dryRun = String(process.env.DRY_RUN || "1") !== "0";
  const limit = Math.max(1, Number(process.env.LIMIT || 50000));
  const outputDir = String(process.env.OUTPUT_DIR || "").trim();

  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to DB");
  console.log(`DRY_RUN=${dryRun ? "1" : "0"} LIMIT=${limit}`);

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const locationLookup = await buildLocationLookup();
  console.log(`Locations indexed: ${locationLookup.size}`);
  const summaryRows = outputDir ? [] : null;

  await bulkBackfill({
    label: "SystemSettings.unitLocationId",
    Model: SettingsModel,
    findFilter: { unitLocation: { $ne: "" }, $or: [{ unitLocationId: null }, { unitLocationId: { $exists: false } }] },
    getString: (d) => d.unitLocation,
    getVendorCode: () => "",
    buildUpdate: (_d, loc) => ({ $set: { unitLocationId: loc._id, unitLocation: loc.name } }),
    locationLookup,
    dryRun,
    limit,
    outputDir,
    summaryRows,
  });

  await bulkBackfill({
    label: "Employees.locationId",
    Model: EmployeeModel,
    findFilter: { location: { $ne: "" }, $or: [{ locationId: null }, { locationId: { $exists: false } }] },
    getString: (d) => d.location,
    getVendorCode: (d) => d.vendorCode,
    buildUpdate: (_d, loc) => ({ $set: { locationId: loc._id, location: loc.name, vendorCode: String(loc.vendorCode || "").toUpperCase() } }),
    locationLookup,
    dryRun,
    limit,
    outputDir,
    summaryRows,
  });

  await bulkBackfill({
    label: "Users.locationId",
    Model: UserModel,
    findFilter: { location: { $ne: "" }, $or: [{ locationId: null }, { locationId: { $exists: false } }] },
    getString: (d) => d.location,
    getVendorCode: (d) => d.vendorCode,
    buildUpdate: (_d, loc) => ({ $set: { locationId: loc._id, location: loc.name, vendorCode: String(loc.vendorCode || "").toUpperCase() } }),
    locationLookup,
    dryRun,
    limit,
    outputDir,
    summaryRows,
  });

  await bulkBackfill({
    label: "Visitors.locationId",
    Model: VisitorModel,
    findFilter: { location: { $ne: "" }, $or: [{ locationId: null }, { locationId: { $exists: false } }] },
    getString: (d) => d.location,
    getVendorCode: (d) => d.vendorCode,
    buildUpdate: (_d, loc) => ({ $set: { locationId: loc._id, location: loc.name, vendorCode: String(loc.vendorCode || "").toUpperCase() } }),
    locationLookup,
    dryRun,
    limit,
    outputDir,
    summaryRows,
  });

  await bulkBackfill({
    label: "Attendance.locationId",
    Model: AttendanceModel,
    findFilter: { location: { $ne: "" }, $or: [{ locationId: null }, { locationId: { $exists: false } }] },
    getString: (d) => d.location,
    getVendorCode: () => "",
    buildUpdate: (_d, loc) => ({ $set: { locationId: loc._id, location: loc.name } }),
    locationLookup,
    dryRun,
    limit,
    outputDir,
    summaryRows,
  });

  // Devices: prefer device.location string if present; otherwise fall back to Employee/Visitor/User locationId by employeeId.
  const [employees, visitors, users] = await Promise.all([
    EmployeeModel.find({ locationId: { $ne: null } }).select("employeeId locationId location vendorCode").lean(),
    VisitorModel.find({ locationId: { $ne: null } }).select("employeeId locationId location vendorCode").lean(),
    UserModel.find({ locationId: { $ne: null } }).select("employeeId locationId location vendorCode").lean(),
  ]);
  const byEmployeeId = new Map();
  const addEmp = (d) => {
    const key = String(d?.employeeId || "").trim();
    if (!key || byEmployeeId.has(key)) return;
    byEmployeeId.set(key, {
      locationId: d.locationId,
      location: String(d.location || "").trim(),
      vendorCode: String(d.vendorCode || "").trim().toUpperCase(),
    });
  };
  employees.forEach(addEmp);
  visitors.forEach(addEmp);
  users.forEach(addEmp);

  const devices = await DeviceModel.find({
    $or: [{ locationId: null }, { locationId: { $exists: false } }],
  })
    .limit(limit)
    .lean();

  const deviceOps = [];
  const deviceUnmatched = new Map();
  for (const d of devices) {
    const locString = String(d.location || "").trim();
    const vendorCode = String(d.vendorCode || "").trim().toUpperCase();
    let resolved = null;
    if (locString) {
      resolved = locationLookup.resolve(locString, vendorCode);
    } else if (d.employeeId) {
      const fallback = byEmployeeId.get(String(d.employeeId).trim());
      if (fallback?.locationId) {
        resolved = {
          _id: fallback.locationId,
          name: fallback.location,
          vendorCode: fallback.vendorCode,
        };
      }
    }

    if (!resolved?._id) {
      const k = normalizeKey(locString || d.employeeId || "");
      if (k) deviceUnmatched.set(k, (deviceUnmatched.get(k) || 0) + 1);
      continue;
    }

    deviceOps.push({
      updateOne: {
        filter: { _id: d._id },
        update: {
          $set: {
            locationId: resolved._id,
            location: resolved.name || d.location || "",
          },
        },
      },
    });
  }

  console.log(`\n== Devices.locationId ==`);
  console.log(
    `Found: ${devices.length}, Matched: ${deviceOps.length}, Unmatched: ${deviceUnmatched.size}`
  );
  if (deviceUnmatched.size) {
    const top = [...deviceUnmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log("Top unmatched (value => count):");
    for (const [k, c] of top) console.log(`- ${k} => ${c}`);
  }
  if (outputDir && deviceUnmatched.size) {
    const payload = [...deviceUnmatched.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
    const file = path.join(outputDir, `unmatched_${sanitizeFilename("Devices.locationId")}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    if (Array.isArray(summaryRows)) {
      payload.forEach((row) => summaryRows.push({ label: "Devices.locationId", ...row }));
    }
  }
  if (!dryRun && deviceOps.length) {
    const result = await DeviceModel.bulkWrite(deviceOps, { ordered: false });
    console.log(`Updated: ${result?.modifiedCount || 0}`);
  } else if (deviceOps.length) {
    console.log("DRY_RUN enabled: not writing changes.");
  }

  if (outputDir && Array.isArray(summaryRows) && summaryRows.length) {
    const summaryJson = path.join(outputDir, "unmatched_summary.json");
    fs.writeFileSync(summaryJson, JSON.stringify(summaryRows, null, 2));

    const summaryCsv = path.join(outputDir, "unmatched_summary.csv");
    const header = "label,value,count\n";
    const lines = summaryRows
      .map((r) => {
        const safe = (v) => `"${String(v ?? "").replace(/\"/g, "\"\"")}"`;
        return `${safe(r.label)},${safe(r.value)},${Number(r.count) || 0}`;
      })
      .join("\n");
    fs.writeFileSync(summaryCsv, header + lines + "\n");
    console.log(`\nUnmatched reports written to: ${outputDir}`);
  }

  console.log("\n✅ Done.");
  await mongoose.disconnect();
};

if (require.main === module) {
  main().catch(async (err) => {
    console.error("❌ Backfill failed:", err);
    try {
      await mongoose.disconnect();
    } catch (_e) {
      // ignore
    }
    process.exit(1);
  });
}
