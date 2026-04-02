const { ajModel, mongoose } = require("../../common/classes/Model");

const visitorSchemaDefinition = {
  firstName: { type: String, trim: true, default: "" },
  lastName: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, required: true },
  employeeId: { type: String, trim: true, unique: true, index: true },
  role: { type: String, default: "visitor" },
  gender: { type: String, trim: true, default: "" },
  dob: { type: Date, default: null },
  email: { type: String, trim: true, lowercase: true, default: "" },
  phone: { type: String, trim: true, default: "" },
  profileImage: { type: String, trim: true, default: "" },
  currentAddress: {
    street: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
  },
  permanentAddress: {
    street: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
  },
  status: { type: String, default: "Active" },
  location: { type: String, trim: true, default: "", index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null, index: true },
  vendorCode: { type: String, trim: true, uppercase: true, default: "", index: true },
  otpVerified: { type: Boolean, default: false, index: true },
  otpVerifiedAt: { type: Date, default: null },
  sessionStatus: {
    type: String,
    enum: ["Logged In", "Logout"],
    default: "Logout",
  },
  rfid: { type: String, unique: true, sparse: true, trim: true, default: null },
  deviceId: { type: String, trim: true, index: true },
  metadata: { type: Object, default: {} },
};

const visitorTransform = (ret) => ({
  id: ret._id,
  firstName: ret.firstName,
  lastName: ret.lastName,
  name: ret.name,
  employeeId: ret.employeeId,
  role: ret.role,
  gender: ret.gender,
  dob: ret.dob,
  email: ret.email,
  phone: ret.phone,
  profileImage: ret.profileImage,
  currentAddress: ret.currentAddress,
  permanentAddress: ret.permanentAddress,
  status: ret.status,
  location: ret.location,
  locationId: ret.locationId,
  vendorCode: ret.vendorCode || "",
  sessionStatus: ret.sessionStatus,
  rfid: ret.rfid,
  deviceId: ret.deviceId,
  createdAt: ret.createdAt,
  updatedAt: ret.updatedAt,
});

const VisitorModel = new ajModel("Visitor", visitorSchemaDefinition, visitorTransform);

module.exports = VisitorModel.getModel();
