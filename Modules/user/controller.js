const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Validator = require("../../helpers/validators");
const User = require("./model");
const EmployeeModel = require("../employees/model");
const LocationModel = require("../location/model");
const { sendEmail } = require("../../helpers/sendemail");

/* ---------------------------------
   Helpers
---------------------------------- */
const JWT_SECRET =
  process.env.SECRET_KEY ||
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET;

const generateAccessToken = (user) =>
  jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: "30d",
  });

const generateRefreshToken = (user) =>
  jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });

const generateQrAccessToken = (user) =>
  jwt.sign(
    { userId: user._id, role: user.role, scope: "qr_access" },
    JWT_SECRET
  );

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const resolveUserLocation = async (user = {}) => {
  let location = String(user.location || "").trim();
  if (location) {
    return location;
  }

  const employeeId = String(user.employeeId || "").trim();
  if (!employeeId) {
    return "";
  }

  const employee = await EmployeeModel.findOne({ employeeId }).lean();
  location = String(employee?.location || "").trim();
  return location;
};

/* ---------------------------------
   Register User
---------------------------------- */
exports.registerUser = async (req, res) => {
  const role = req.body.role || "employee";
  const email = req.body.email?.toLowerCase().trim();
  const password = req.body.password;
  const name = req.body.name?.trim();
  const employeeId = req.body.employeeId?.trim();

  const rules = {
    name: "required",
    email: "required|email",
    password: "required|min:6",
  };
  if (req.body.role) {
    rules.role =
      "in:admin,hr,supervisor,employee,manager,superadmin,contractor,visitor";
  }

  try {
    const validator = new Validator(
      {
        ...req.body,
        email,
        password,
        name,
        employeeId,
        role,
      },
      rules
    );
    await validator.validate();

    const existingUser = await User.findOne({
      $or: [{ email }, { employeeId }],
    });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Only one superadmin
    if (role === "superadmin") {
      const roleUser = await User.findOne({ role });
      if (roleUser) {
        return res.status(400).json({
          message: `A ${role} already exists`,
        });
      }
    }

    const hashedPassword = await hashPassword(password);

    let locationId = null;
    let vendorCode = "";
    if (req.body.location) {
      const loc = await LocationModel.findOne({ name: req.body.location });
      if (loc) {
        locationId = loc._id;
        vendorCode = loc.vendorCode || "";
      }
    }

    const user = await User.create({
      firstName: req.body.firstName || "",
      lastName: req.body.lastName || "",
      name: name || req.body.name || `${req.body.firstName} ${req.body.lastName}`.trim(),
      email,
      employeeId: employeeId || `USR${Date.now()}`, // Generate if missing for system users
      role,
      password: hashedPassword,
      location: req.body.location || "",
      locationId: locationId,
      vendorCode: vendorCode,
    });

    res.status(201).json({
      status: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        employeeId: user.employeeId,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(error.status || 500).json({
      status: false,
      message: error.firstMessage || error.message || "Server error",
      error: error.message,
      errors: error.errors,
    });
  }
};

/* ---------------------------------
   Get All Users (for superadmin)
---------------------------------- */
const paginate = require("../../helpers/limitoffset");
exports.getAll = async (req, res) => {
  try {
    const { page, limit, search, role } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);
    const filter = {};
    if (role) filter["role"] = role;

    const result = await paginate(
      User,
      filter,
      pageNumber,
      limit,
      [],
      ["name", "email", "employeeId", "role", "location"],
      search,
      { createdAt: -1 }
    );

    return res.status(200).json({
      status: true,
      data: result.data,
      total: result.pagination?.totalrecords || 0,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

/* ---------------------------------
   Get User By ID
---------------------------------- */
exports.getbyid = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }
    return res.status(200).json({ status: true, data: user });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

/* ---------------------------------
   Update User
---------------------------------- */
exports.update = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) {
      updates.password = await hashPassword(updates.password);
    } else {
      delete updates.password;
    }

    if (updates.firstName || updates.lastName || updates.name) {
      const f = updates.firstName || "";
      const l = updates.lastName || "";
      updates.name = updates.name || `${f} ${l}`.trim();
    }

    if (updates.location) {
      const loc = await LocationModel.findOne({ name: updates.location });
      if (loc) {
        updates.locationId = loc._id;
        updates.vendorCode = loc.vendorCode || "";
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    });
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Optional: If user is linked to an employee, update employee record too?
    // For now, keep it simple as per request.

    res.status(200).json({
      status: true,
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/* ---------------------------------
   Remove User
---------------------------------- */
exports.remove = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }
    res.status(200).json({ status: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/* ---------------------------------
   Login User
---------------------------------- */
exports.loginUser = async (req, res) => {
  const email = req.body.email?.toLowerCase().trim();
  const password = req.body.password;

  try {
    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required",
      });
    }

    const validator = new Validator(
      { email, password },
      { email: "required|email", password: "required" }
    );
    await validator.validate();

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await User.findByIdAndUpdate(user._id, {
      sessionStatus: "Logged In",
    });

    const location = await resolveUserLocation(user);

    res.status(200).json({
      id: user._id,
      name: user.name,
      profileImage: user.profileImage || "",
      employeeId: user.employeeId || "",
      email: user.email || "",
      role: user.role,
      location,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/* ---------------------------------
   QR Login User (no expiry, limited scope)
---------------------------------- */
exports.qrLoginUser = async (req, res) => {
  const email = req.body.email?.toLowerCase().trim();
  const password = req.body.password;

  try {
    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required",
      });
    }

    const validator = new Validator(
      { email, password },
      { email: "required|email", password: "required" }
    );
    await validator.validate();

    const user = await User.findOne({ email }).select("+password");
    if (!user || !user.password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const allowedRoles = ["superadmin", "admin", "hr", "manager"];
    if (!allowedRoles.includes(String(user.role || "").toLowerCase())) {
      return res.status(403).json({ message: "You are not authorized" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const accessToken = generateQrAccessToken(user);
    const location = await resolveUserLocation(user);

    res.status(200).json({
      id: user._id,
      name: user.name,
      profileImage: user.profileImage || "",
      employeeId: user.employeeId || "",
      email: user.email || "",
      role: user.role,
      location,
      accessToken,
    });
  } catch (error) {
    console.error("QR Login Error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/* ---------------------------------
   Forgot Password - Send OTP
---------------------------------- */
exports.forgotPassword = async (req, res) => {
  const email = req.body.email?.toLowerCase().trim();

  try {
    const validator = new Validator(
      { email },
      { email: "required|email" }
    );
    await validator.validate();

    const user = await User.findOne({ email }).select(
      "email name firstName lastName role"
    );
    if (!user) {
      return res.status(400).json({
        status: false,
        message: "Email not found",
      });
    }
    if (["employee", "contractor", "visitor"].includes(user.role)) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized",
      });
    }
    const resolvedName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || user.name?.trim();

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          resetOtp: otpHash,
          resetOtpExpiresAt: otpExpiresAt,
          resetOtpVerified: false,
        },
      }
    );

    await sendEmail(
      "resetpassword.html",
      user.email,
      {
        OTP: otp,
        subject: "Password Reset OTP",
        USER_NAME: resolvedName || "User",
      },
      { fromFile: true, subject: "Password Reset OTP" }
    );

    res.status(200).json({
      status: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(error.status || error.statusCode || 500).json({
      status: false,
      message: error.firstMessage || error.message || "Server error",
      error: error.message,
      errors: error.errors || undefined,
    });
  }
};

/* ---------------------------------
   Reset Password - Verify OTP
---------------------------------- */
exports.verifyResetOtp = async (req, res) => {
  const email = req.body.email?.toLowerCase().trim();
  const otp = String(req.body.otp || "").trim();

  try {
    const validator = new Validator(
      { email, otp },
      { email: "required|email", otp: "required" }
    );
    await validator.validate();

    const user = await User.findOne({ email }).select("+resetOtp");
    if (!user || !user.resetOtp || !user.resetOtpExpiresAt) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.resetOtpExpiresAt < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    const isMatch = await bcrypt.compare(otp, user.resetOtp);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.resetOtpVerified = true;
    await user.save();

    res.status(200).json({
      status: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(error.status || error.statusCode || 500).json({
      status: false,
      message: error.firstMessage || error.message || "Server error",
      error: error.message,
      errors: error.errors || undefined,
    });
  }
};

exports.resetPassword = async (req, res) => {
  const email = req.body.email?.toLowerCase().trim();
  const newPassword = req.body.newPassword;

  try {
    const validator = new Validator(
      { email, newPassword },
      { email: "required|email", newPassword: "required|min:6" }
    );
    await validator.validate();

    const user = await User.findOne({ email }).select("+password +resetOtp");
    if (!user || !user.resetOtp || !user.resetOtpExpiresAt) {
      return res.status(400).json({ message: "OTP verification required" });
    }

    if (user.resetOtpExpiresAt < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    if (!user.resetOtpVerified) {
      return res.status(400).json({ message: "OTP verification required" });
    }

    user.password = await hashPassword(newPassword);
    user.resetOtp = undefined;
    user.resetOtpExpiresAt = undefined;
    user.resetOtpVerified = false;
    await user.save();

    res.status(200).json({
      status: true,
      message: "Password reset successful",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(error.status || error.statusCode || 500).json({
      status: false,
      message: error.firstMessage || error.message || "Server error",
      error: error.message,
      errors: error.errors || undefined,
    });
  }
};
