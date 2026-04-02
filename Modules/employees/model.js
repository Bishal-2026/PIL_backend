const mongoose = require("mongoose");
const { ajModel } = require("../../common/classes/Model");

const addressSchema = {
  street: { type: String, trim: true, default: null },
  city: { type: String, trim: true, default: null },
  state: { type: String, trim: true, default: null },
  pincode: { type: String, trim: true, default: null },
};

const bankSchema = {
  aadharcardnumber: { type: String, trim: true, default: null },
  pancard: { type: String, trim: true, default: null },
  accountNumber: { type: String, trim: true, default: null },
  ifscCode: { type: String, trim: true, default: null },
  bankName: { type: String, trim: true, default: null },
  branch: { type: String, trim: true, default: null },
};

const emergencySchema = {
  name: { type: String, trim: true },
  relation: { type: String, trim: true },
  phone: { type: String, trim: true },
};

const systemAccessSchema = {
  emailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
  loginEnabled: { type: Boolean, default: true },
  lastLogin: { type: Date },
};

const employeeSchema = {
  profileImage: { type: String, default: "" },

  // Personal info
  name: { type: String, required: true, trim: true },
  gender: { type: String, enum: ["Male", "Female", "Other"], default: null },
  dob: { type: Date, default: null },
  email: { type: String, unique: true, sparse: true, trim: true, default: null },
  phone: { type: String, trim: true, default: null },
  password: { type: String, default: null, select: false },
  rfid: { type: String, unique: true, sparse: true, trim: true, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

  // Addresses
  currentAddress: addressSchema,
  permanentAddress: addressSchema,

  // Professional info
  employeeId: { type: String, required: true, unique: true, trim: true },
  joiningDate: { type: Date, default: null },
  designation: { type: String, trim: true, default: null },
  department: { type: String, trim: true, default: null },
  section: { type: String, trim: true, default: null },
  department: { type: String, trim: true, default: null },
  section: { type: String, trim: true, default: null },
  shift: { type: String, trim: true, default: null },
  employmentType: { type: String, default: "Full-time", trim: true },
  role: { type: String, required: true, default: "employee", trim: true },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  location: { type: String, trim: true, default: "", index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null, index: true },
  deviceId: { type: String, trim: true, index: true },
  tag: { type: String, trim: true, default: "", index: true },
  vendorCode: { type: String, trim: true, uppercase: true, default: "", index: true },
  otpVerified: { type: Boolean, default: false, index: true },
  otpVerifiedAt: { type: Date, default: null },
  attendanceStatus: {
    type: String,
    enum: ["Present", "Absent", "On Leave", "Active", "Inactive"],
    default: "Present",
  },

  // Banking
  bankDetails: bankSchema,

  // Emergency
  emergencyContact: emergencySchema,

  // System access
  systemAccess: systemAccessSchema,

  // Raw payload passthrough
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
};

const employeeModel = new ajModel("Employee", employeeSchema);

module.exports = employeeModel.getModel();
