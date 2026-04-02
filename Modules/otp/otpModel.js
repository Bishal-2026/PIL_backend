const { ajModel, mongoose } = require("../../common/classes/Model");

const deviceOtpSchemaDefinition = {
  transactionId: { type: String, required: true, unique: true, index: true },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
    index: true,
  },
  employeeId: { type: String, trim: true, index: true },
  deviceId: { type: String, trim: true, required: true, index: true },
  otp: { type: String, required: true, trim: true },
  otpExpiry: { type: Date, required: true },
  verified: { type: Boolean, default: false },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
};

const deviceOtpModel = new ajModel("DeviceOtp", deviceOtpSchemaDefinition);

module.exports = deviceOtpModel.getModel();
