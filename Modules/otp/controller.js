const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const DeviceModel = require("../device/model");
const UserModel = require("../user/model");
const EmployeeModel = require("../employees/model");
const VisitorModel = require("../user/visitorModel");
const DeviceOtp = require("./otpModel");
const OtpEmailConfig = require("./otpEmailModel");
const SettingsModel = require("../settings/model");
const { sendEmail } = require("../../helpers/sendemail");

const normalizeDeviceId = (value) => String(value || "").trim();
const normalizeName = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const escapeRegExp = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const STATIC_DEVICE_OTP = String(process.env.STATIC_DEVICE_OTP || "").trim();
const STATIC_DEVICE_EMPLOYEE_ID = String(
  process.env.STATIC_DEVICE_EMPLOYEE_ID || ""
).trim();
const STATIC_DEVICE_USER_NAME = normalizeName(
  process.env.STATIC_DEVICE_USER_NAME || ""
);

// Step 1: Send OTP for an existing device
exports.sendOtp = async (req, res) => {
  try {
    const { deviceId, deviceName, userId, employeeId: employeeIdBody } = req.body;
    if (!userId) {
      return res.status(400).json({ status: false, message: "userId is required" });
    }
    if (!deviceId && !deviceName) {
      return res.status(400).json({ status: false, message: "deviceId or deviceName is required" });
    }

    // Resolve user by user collection; if missing, fall back to employee collection
    let user = await UserModel.findById(userId);
    let employee = null;
    let visitor = null;
    if (!user) {
      employee =
        (mongoose.isValidObjectId(userId) && (await EmployeeModel.findById(userId))) ||
        (employeeIdBody && (await EmployeeModel.findOne({ employeeId: employeeIdBody }))) ||
        (await EmployeeModel.findOne({ employeeId: userId }));
      if (!employee) {
        visitor =
          (mongoose.isValidObjectId(userId) && (await VisitorModel.findById(userId))) ||
          (employeeIdBody && (await VisitorModel.findOne({ employeeId: employeeIdBody }))) ||
          (await VisitorModel.findOne({ employeeId: userId }));
        if (!visitor) {
          return res.status(404).json({ status: false, message: "User not found" });
        }
      }
      // Try to locate linked user by employeeId, but allow proceeding with employee only
      if (employee?.employeeId) {
        user = await UserModel.findOne({ employeeId: employee.employeeId });
      }
    } else if (user.employeeId) {
      employee =
        (await EmployeeModel.findOne({ employeeId: user.employeeId })) ||
        (employeeIdBody && (await EmployeeModel.findOne({ employeeId: employeeIdBody })));
    } else if (employeeIdBody) {
      employee = await EmployeeModel.findOne({ employeeId: employeeIdBody });
    }

    const resolvedUserId = user?._id || employee?._id || visitor?._id;
    const resolvedEmployeeId =
      user?.employeeId || employee?.employeeId || visitor?.employeeId;
    if (!resolvedUserId) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const deviceFilters = [];
    if (deviceId) {
      const normalizedDeviceId = normalizeDeviceId(deviceId);
      deviceFilters.push({ deviceId: new RegExp(`^${normalizedDeviceId}$`, "i") });
      if (mongoose.isValidObjectId(deviceId)) {
        deviceFilters.push({ _id: deviceId });
      }
    } else if (deviceName) {
      deviceFilters.push({ deviceName });
    }

    const deviceQuery = deviceFilters.length ? { $or: deviceFilters } : {};
    const device = await DeviceModel.findOne(deviceQuery);
    if (!device) {
      return res.status(404).json({ status: false, message: "Device not found" });
    }

    const matchesUser =
      (device.userId && String(device.userId) === String(resolvedUserId)) ||
      (device.employeeId && resolvedEmployeeId && device.employeeId === resolvedEmployeeId);
    if (!matchesUser) {
      return res.status(400).json({
        status: false,
        message: "Device does not belong to this user",
      });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const transactionId = randomUUID();
    const hashedOtp = await bcrypt.hash(otpCode, 10);

    const normalizedDeviceId = normalizeDeviceId(
      device.deviceId || deviceId || device._id?.toString()
    );
    await DeviceOtp.create({
      transactionId,
      userId: resolvedUserId,
      employeeId: resolvedEmployeeId,
      deviceId: normalizedDeviceId,
      otp: hashedOtp,
      otpExpiry: otpExpiresAt,
      verified: false,
      raw: req.body,
    });

    const resolvedLocation = String(
      employee?.location || visitor?.location || user?.location || ""
    ).trim();
    if (!resolvedLocation) {
      return res.status(400).json({
        status: false,
        message: "User location not found",
      });
    }

    // Resolve OTP email from settings record matching location
    const locationSettings = await SettingsModel.findOne({
      unitLocation: new RegExp(`^${escapeRegExp(resolvedLocation)}$`, "i"),
    }).lean();
    const defaultSettings = locationSettings
      ? null
      : await SettingsModel.findOne({ unitLocation: { $in: [null, ""] } }).lean();
    const otpEmail = String(
      locationSettings?.otpEmail || defaultSettings?.otpEmail || ""
    )
      .trim()
      .toLowerCase();
    if (!otpEmail) {
      return res.status(400).json({
        status: false,
        message: `OTP email not configured in settings for location: ${resolvedLocation}`,
      });
    }

    const resolvedUserName = user?.name || employee?.name || visitor?.name || "User";
    const displayEmployeeId = resolvedEmployeeId || "N/A";
    await sendOtpEmail(
      otpEmail,
      otpCode,
      device.deviceName || deviceName,
      resolvedUserName,
      displayEmployeeId
    );

    return res.status(200).json({
      status: true,
      message: "OTP sent successfully",
      deviceId: device.deviceId || device._id,
      otpTransactionId: transactionId,
      otpExpiresAt,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const otp = String(req.body.otp || "").trim();
    const otpTransactionId = String(req.body.otpTransactionId || "").trim();
    const providedEmployeeId = String(req.body.employeeId || "").trim();
    const providedName = normalizeName(
      req.body.userName || req.body.username || req.body.name || ""
    );
    const deviceId =
      req.body.deviceId ||
      req.headers["x-device-id"] ||
      req.headers["device-id"] ||
      req.headers["deviceid"];

    if (!otpTransactionId || !otp) {
      return res.status(400).json({
        status: false,
        message: "otpTransactionId and otp are required",
      });
    }
    if (!deviceId) {
      return res.status(400).json({
        status: false,
        message: "deviceId is required in body or headers",
      });
    }

    const normalizedDeviceId = normalizeDeviceId(deviceId);
    const otpRecord = await DeviceOtp.findOne({
      transactionId: otpTransactionId,
      deviceId: normalizedDeviceId,
      verified: false,
    });
    if (!otpRecord) {
      return res.status(400).json({ status: false, message: "Invalid OTP" });
    }
    if (otpRecord.otpExpiry < new Date()) {
      return res.status(400).json({ status: false, message: "OTP has expired" });
    }

    let isMatch = false;
    const hasStaticConfig =
      STATIC_DEVICE_OTP && STATIC_DEVICE_EMPLOYEE_ID && STATIC_DEVICE_USER_NAME;
    const isStaticOtpCandidate = hasStaticConfig && otp === STATIC_DEVICE_OTP;
    if (isStaticOtpCandidate) {
      const [userRecord, employeeRecord] = await Promise.all([
        UserModel.findById(otpRecord.userId).lean(),
        otpRecord.employeeId
          ? EmployeeModel.findOne({ employeeId: otpRecord.employeeId }).lean()
          : null,
      ]);
      const resolvedEmployeeId =
        userRecord?.employeeId || employeeRecord?.employeeId || "";
      const resolvedName = normalizeName(
        userRecord?.name || employeeRecord?.name || ""
      );
      const providedEmployeeOk =
        !providedEmployeeId || providedEmployeeId === STATIC_DEVICE_EMPLOYEE_ID;
      const providedNameOk =
        !providedName || providedName === STATIC_DEVICE_USER_NAME;
      if (
        resolvedEmployeeId !== STATIC_DEVICE_EMPLOYEE_ID ||
        resolvedName !== STATIC_DEVICE_USER_NAME ||
        !providedEmployeeOk ||
        !providedNameOk
      ) {
        return res.status(400).json({ status: false, message: "Invalid OTP" });
      }
      isMatch = true;
    } else {
      isMatch = await bcrypt.compare(otp, otpRecord.otp);
    }
    if (!isMatch) {
      return res.status(400).json({ status: false, message: "Invalid OTP" });
    }

    const deviceIdRegex = new RegExp(`^${normalizedDeviceId}$`, "i");
    const deviceQuery = { $or: [{ deviceId: deviceIdRegex }] };
    if (mongoose.isValidObjectId(deviceId)) {
      deviceQuery.$or.push({ _id: deviceId });
    }
    const device = await DeviceModel.findOne(deviceQuery);
    if (!device) {
      return res.status(404).json({ status: false, message: "Device not found" });
    }

    otpRecord.verified = true;
    await otpRecord.save();

    device.verified = true;
    device.deviceStatus = "Active";
    device.status = "ONLINE";
    if (!device.registerToken) {
      device.registerToken = randomUUID();
    }
    await device.save();

    // OTP gate for dashboard visibility: mark the principal as verified
    const now = new Date();
    if (otpRecord.employeeId) {
      const updatedEmployee = await EmployeeModel.findOneAndUpdate(
        { employeeId: otpRecord.employeeId },
        { $set: { otpVerified: true, otpVerifiedAt: now } },
        { new: true }
      );
      if (!updatedEmployee) {
        await VisitorModel.findOneAndUpdate(
          { employeeId: otpRecord.employeeId },
          { $set: { otpVerified: true, otpVerifiedAt: now } },
          { new: true }
        );
      }
    } else if (otpRecord.userId && mongoose.isValidObjectId(otpRecord.userId)) {
      const updatedEmployee = await EmployeeModel.findByIdAndUpdate(
        otpRecord.userId,
        { $set: { otpVerified: true, otpVerifiedAt: now } },
        { new: true }
      );
      if (!updatedEmployee) {
        await VisitorModel.findByIdAndUpdate(
          otpRecord.userId,
          { $set: { otpVerified: true, otpVerifiedAt: now } },
          { new: true }
        );
      }
    }

    return res.status(200).json({
      status: true,
      message: "Device verified successfully",
      registerToken: device.registerToken,
      deviceId: device.deviceId || device._id,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Superadmin: set OTP email (global)
exports.setOtpEmail = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ status: false, message: "email is required" });
    }

    const record = await OtpEmailConfig.findOneAndUpdate(
      {},
      { email, updatedBy: req.user?._id || null },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      status: true,
      message: "OTP email saved",
      data: record,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Superadmin: get OTP email (global)
exports.getOtpEmail = async (req, res) => {
  try {
    const record = await OtpEmailConfig.findOne();
    if (!record) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res.status(200).json({
      status: true,
      data: record,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

const sendOtpEmail = async (to, otp, deviceName, userName, employeeId) => {
  const resolvedDeviceName = deviceName || "device";
  const resolvedUserName = userName || "User";
  const resolvedEmployeeId = employeeId || "N/A";
  await sendEmail(
    "pidilitetemplate.html",
    to,
    {
      USER_NAME: resolvedUserName,
      EMPLOYEE_ID: resolvedEmployeeId,
      OTP: otp,
      subject: "PIL Device Verification OTP",
    },
    { fromFile: true, subject: "PIL Device Verification OTP" }
  );
};
