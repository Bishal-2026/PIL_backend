const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const VendorModel = require("./model");
const UserModel = require("../user/model");
const LocationModel = require("../location/model");
const Validator = require("../../helpers/validators");
const { sendEmail } = require("../../helpers/sendemail");

const normalizeVendorCode = (value) => String(value || "").trim().toUpperCase();
const normalizeName = (value) => String(value || "").trim();

const format = (doc) => {
  const d = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return { ...d, id: d._id?.toString?.() || d.id };
};

const generateUniqueVendorCode = async (orgName) => {
  const base = String(orgName || "VND")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 4)
    .toUpperCase();

  while (true) {
    const randomSuffix = Math.floor(100 + Math.random() * 900).toString(); // 3-digit random suffix
    const candidate = `${base}${randomSuffix}`;
    const exists = await VendorModel.findOne({ vendorCode: candidate }).select("_id").lean();
    if (!exists) return candidate;
  }
};

// Public registration endpoint - Step 1: Initialize registration and send OTP
exports.register = async (req, res) => {
  try {
    const { name, email, password, organizationName, contactNo, address, latitude, longitude, radius } = req.body;

    const rules = {
      name: "required",
      email: "required|email",
      password: "required|min:6",
      organizationName: "required",
      contactNo: "required",
      address: "required",
    };

    const validator = new Validator(req.body, rules);
    await validator.validate();

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email: email.toLowerCase() }).select("_id").lean();
    if (existingUser) {
      return res.status(400).json({ status: false, message: "Email already registered" });
    }

    // Hash password early to store in vendor record
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate unique vendor code
    const vendorCode = await generateUniqueVendorCode(organizationName);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Create Vendor in unverified state
    const vendor = await VendorModel.create({
      name: organizationName,
      email: email.toLowerCase(),
      phone: contactNo,
      address: address || "",
      latitude: latitude || 0,
      longitude: longitude || 0,
      radius: radius || 500,
      vendorCode,
      verified: false,
      otp,
      otpExpiry,
      raw: {
        ...req.body,
        hashedPassword, // Store temporarily to create user after verification
        registeredBy: name
      },
    });

    try {
      await sendEmail(
        "vendorVerification.html",
        email.toLowerCase(),
        {
          USER_NAME: name,
          OTP: otp,
          ORGANIZATION_NAME: organizationName,
          subject: "Verify your Organization Registration",
        },
        { fromFile: true, subject: "Verify your Organization Registration" }
      );
    } catch (emailError) {
      console.error("Verification Email Failed:", emailError);
      // We still return success because the vendor record is created, but maybe warn
    }

    return res.status(201).json({
      status: true,
      message: "OTP sent to your email. Please verify to complete registration.",
      data: {
        email: email.toLowerCase(),
        vendorCode: vendor.vendorCode,
      }
    });
  } catch (error) {
    console.error("Vendor Register Error:", error);
    return res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || "Server error",
    });
  }
};

// Step 2: Verify OTP and finalize registration (create admin user)
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ status: false, message: "Email and OTP are required" });
    }

    const vendor = await VendorModel.findOne({
      email: email.toLowerCase(),
      verified: false
    });

    if (!vendor) {
      return res.status(404).json({ status: false, message: "Registration not found or already verified" });
    }

    if (vendor.otp !== String(otp)) {
      return res.status(400).json({ status: false, message: "Invalid OTP" });
    }

    if (vendor.otpExpiry < new Date()) {
      return res.status(400).json({ status: false, message: "OTP has expired" });
    }

    // Finalize registration
    vendor.verified = true;
    vendor.otp = undefined;
    vendor.otpExpiry = undefined;
    await vendor.save();

    // Create the Admin User
    const { name, address, raw } = vendor;
    // Create an initial Location for this vendor
    let locationName = (address || name).trim();
    // Ensure location name is unique as per schema requirement
    const nameExists = await LocationModel.findOne({ name: locationName }).select("_id").lean();
    if (nameExists) {
      locationName = `${locationName} (${vendor.vendorCode})`;
    }

    const newLocation = await LocationModel.create({
      name: locationName,
      vendorCode: vendor.vendorCode,
      lat: vendor.latitude || 0,
      lng: vendor.longitude || 0,
      radius: vendor.radius || 500,
      raw: { source: "vendor_registration" }
    });

    const userData = {
      name: raw.name || name,
      email: vendor.email,
      password: raw.hashedPassword,
      role: "admin",
      vendorCode: vendor.vendorCode,
      employeeId: `ADM-${vendor.vendorCode}`,
      location: locationName,
      locationId: newLocation._id,
    };

    const user = await UserModel.create(userData);

    return res.status(200).json({
      status: true,
      message: "Email verified and registration complete!",
      data: {
        vendor: format(vendor),
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          vendorCode: user.vendorCode,
        }
      }
    });
  } catch (error) {
    console.error("Vendor OTP Verification Error:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Public endpoint for registration flows: verify a vendorCode and return vendor details.
exports.verifyPublic = async (req, res) => {
  try {
    const vendorCode = normalizeVendorCode(req.query?.vendorCode);
    if (!vendorCode) {
      return res.status(400).json({ status: false, message: "vendorCode is required" });
    }

    const vendor = await VendorModel.findOne({ vendorCode })
      .select("name vendorCode")
      .lean();
    if (!vendor) {
      return res.status(404).json({ status: false, message: "Invalid vendorCode" });
    }

    return res.status(200).json({
      status: true,
      message: "Vendor verified",
      data: {
        id: String(vendor._id),
        name: vendor.name,
        vendorCode: vendor.vendorCode,
      },
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.add = async (req, res) => {
  try {
    const name = normalizeName(req.body?.name);
    const vendorCode = normalizeVendorCode(req.body?.vendorCode);
    if (!name) {
      return res.status(400).json({ status: false, message: "Company name is required" });
    }
    if (!vendorCode) {
      return res.status(400).json({ status: false, message: "vendorCode is required" });
    }

    const exists = await VendorModel.findOne({ vendorCode }).select("_id").lean();
    if (exists) {
      return res.status(400).json({ status: false, message: "vendorCode already exists" });
    }

    const vendor = await VendorModel.create({ name, vendorCode, raw: req.body });
    return res.status(201).json({ status: true, message: "Vendor created", data: format(vendor) });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const search = String(req.query?.search || "").trim();
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { vendorCode: { $regex: search, $options: "i" } },
      ];
    }

    const vendors = await VendorModel.find(filter)
      .select("name vendorCode")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      status: true,
      vendors: vendors.map((v) => ({
        id: String(v._id),
        name: v.name,
        vendorCode: v.vendorCode,
      })),
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.isValidObjectId(id) ? { _id: id } : { vendorCode: normalizeVendorCode(id) };
    const vendor = await VendorModel.findOne(query).select("name vendorCode").lean();
    if (!vendor) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res.status(200).json({ status: true, data: format(vendor) });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ status: false, message: "Company name is required" });
    }

    const vendor = await VendorModel.findByIdAndUpdate(
      id,
      { $set: { name, raw: req.body } },
      { new: true, runValidators: true }
    ).lean();
    if (!vendor) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res.status(200).json({ status: true, message: "Vendor updated", data: format(vendor) });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await VendorModel.findByIdAndDelete(id).lean();
    if (!vendor) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res.status(200).json({ status: true, message: "Vendor deleted" });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
