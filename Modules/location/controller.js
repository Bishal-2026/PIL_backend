const mongoose = require("mongoose");
const paginate = require("../../helpers/limitoffset");
const LocationModel = require("./model");
const SettingsModel = require("../settings/model");
const EmployeeModel = require("../employees/model");
const UserModel = require("../user/model");
const VisitorModel = require("../user/visitorModel");
const AttendanceModel = require("../attendance/model");
const DeviceModel = require("../device/model");

const validatePayload = ({ name, vendorCode, lat, lng, radius }) => {
  if (!name) throw new Error("Location name is required");
  if (!vendorCode) throw new Error("Vendor code is required");
  if (lat === undefined || lat === null) throw new Error("Latitude is required");
  if (lng === undefined || lng === null) throw new Error("Longitude is required");
  if (radius === undefined || radius === null) throw new Error("Radius is required");
};

const normalizeNumber = (value) => (value === undefined ? value : Number(value));

const normalizePayload = (body) => ({
  name: body.name?.trim(),
  vendorCode: String(body.vendorCode || "").trim().toUpperCase(),
  lat: normalizeNumber(body.lat),
  lng: normalizeNumber(body.lng ?? body.long),
  radius: normalizeNumber(body.radius),
  otpEmail: String(body.otpEmail || "").trim().toLowerCase(),
  raw: body,
});

const format = (doc) => {
  const d = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return { ...d, id: d._id?.toString?.() || d.id };
};

exports.add = async (req, res) => {
  try {
    const data = normalizePayload(req.body);
    validatePayload(data);

    const exists = await LocationModel.findOne({ name: data.name });
    if (exists) {
      return res.status(400).json({ status: false, message: "Location name already exists" });
    }

    const loc = await LocationModel.create(data);
    return res.status(201).json({ status: true, message: "Location created", data: format(loc) });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);

    const result = await paginate(
      LocationModel,
      {},
      pageNumber,
      limit,
      [],
      ["name"],
      search
    );

    const locations = result.data.map(format);

    return res.status(200).json({
      status: result.status,
      message: result.message,
      locations,
      total: result.pagination?.totalrecords || 0,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: "Server Error", error: error.message });
  }
};

exports.getCoords = async (_req, res) => {
  try {
    const locations = await LocationModel.find({})
      .select("name vendorCode lat lng radius otpEmail")
      .lean();
    return res.status(200).json({
      status: true,
      data: locations.map((loc) => ({
        name: loc.name,
        vendorCode: loc.vendorCode || "",
        lat: loc.lat,
        lng: loc.lng,
        radius: loc.radius,
        otpEmail: loc.otpEmail || "",
      })),
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Public endpoint for registration flows: list locations for a vendorCode
exports.getPublicByVendorCode = async (req, res) => {
  try {
    const vendorCode = String(req.query.vendorCode || "").trim().toUpperCase();

    // If no vendorCode provided, fetch all locations (equivalent to getCoords behavior)
    const query = vendorCode ? { vendorCode } : {};

    const locations = await LocationModel.find(query)
      .select("name vendorCode lat lng radius otpEmail")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      status: true,
      vendorCode: vendorCode || "ALL",
      locations: locations.map((loc) => ({
        name: loc.name,
        vendorCode: loc.vendorCode || "",
        lat: loc.lat,
        lng: loc.lng,
        radius: loc.radius,
        otpEmail: loc.otpEmail || "",
      })),
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.isValidObjectId(id) ? { _id: id } : { name: id };
    const loc = await LocationModel.findOne(query);
    if (!loc) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res.status(200).json({ status: true, message: "Record fetched", data: format(loc) });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = normalizePayload(req.body);
    validatePayload(data);

    const existing = await LocationModel.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ status: false, message: "Not found" });
    }

    const existingName = String(existing.name || "").trim();
    const nextName = String(data.name || "").trim();
    const nameChanged =
      existingName &&
      nextName &&
      existingName.toLowerCase() !== nextName.toLowerCase();

    let nextAliases = Array.isArray(existing.aliases) ? [...existing.aliases] : [];
    if (nameChanged && existingName) {
      nextAliases.push(existingName);
    }

    // Deduplicate aliases (case-insensitive) and avoid keeping the current name as an alias.
    const seen = new Set();
    nextAliases = nextAliases
      .map((a) => String(a || "").trim())
      .filter(Boolean)
      .filter((a) => a.toLowerCase() !== nextName.toLowerCase())
      .filter((a) => {
        const key = a.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const loc = await LocationModel.findByIdAndUpdate(
      id,
      { ...data, aliases: nextAliases },
      {
        new: true,
        runValidators: true,
      }
    );

    if (nameChanged) {
      const locationId = loc?._id;
      const canonicalName = String(loc?.name || "").trim();
      const canonicalVendorCode = String(loc?.vendorCode || "").trim().toUpperCase();

      await Promise.all([
        SettingsModel.updateMany(
          { $or: [{ unitLocationId: locationId }, { unitLocation: existingName }] },
          { $set: { unitLocation: canonicalName, unitLocationId: locationId } }
        ),
        EmployeeModel.updateMany(
          { $or: [{ locationId: locationId }, { location: existingName }] },
          {
            $set: {
              location: canonicalName,
              locationId: locationId,
              vendorCode: canonicalVendorCode,
            },
          }
        ),
        UserModel.updateMany(
          { $or: [{ locationId: locationId }, { location: existingName }] },
          {
            $set: {
              location: canonicalName,
              locationId: locationId,
              vendorCode: canonicalVendorCode,
            },
          }
        ),
        VisitorModel.updateMany(
          { $or: [{ locationId: locationId }, { location: existingName }] },
          {
            $set: {
              location: canonicalName,
              locationId: locationId,
              vendorCode: canonicalVendorCode,
            },
          }
        ),
        AttendanceModel.updateMany(
          { $or: [{ locationId: locationId }, { location: existingName }] },
          { $set: { location: canonicalName, locationId: locationId } }
        ),
        DeviceModel.updateMany(
          { $or: [{ locationId: locationId }, { location: existingName }] },
          {
            $set: {
              location: canonicalName,
              locationId: locationId,
              vendorCode: canonicalVendorCode,
            },
          }
        ),
      ]);
    }

    return res.status(200).json({ status: true, message: "Location updated", data: format(loc) });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const loc = await LocationModel.findByIdAndDelete(id);
    if (!loc) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res.status(200).json({ status: true, message: "Location deleted" });
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};
