const { ajModel, mongoose } = require("../../common/classes/Model");

const otpEmailSchemaDefinition = {
  email: { type: String, required: true, trim: true, lowercase: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
};

const otpEmailModel = new ajModel(
  "OtpEmailConfig",
  otpEmailSchemaDefinition,
  (ret) => ({
    id: ret._id,
    email: ret.email,
    updatedBy: ret.updatedBy,
    createdAt: ret.createdAt,
    updatedAt: ret.updatedAt,
  }),
  { timestamps: true }
);

module.exports = otpEmailModel.getModel();
