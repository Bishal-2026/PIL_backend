const { ajModel } = require("../../common/classes/Model");

const vendorSchemaDefinition = {
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true },
  latitude: { type: Number },
  longitude: { type: Number },
  radius: { type: Number, default: 500 },
  vendorCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: true,
    index: true,
  },
  verified: { type: Boolean, default: false },
  otp: { type: String, trim: true },
  otpExpiry: { type: Date },
  raw: { type: Object, default: {} },
};

const vendorModel = new ajModel("Vendor", vendorSchemaDefinition);

module.exports = vendorModel.getModel();

