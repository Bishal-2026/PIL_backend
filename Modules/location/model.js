const { ajModel, mongoose } = require("../../common/classes/Model");

const locationSchemaDefinition = {
  name: { type: String, required: true, trim: true, unique: true },
  // Older names / alternate spellings used by older app builds, QR tokens, etc.
  aliases: { type: [String], default: [] },
  // Multi-tenant grouping key (a single vendorCode can own multiple locations)
  vendorCode: { type: String, trim: true, uppercase: true, index: true, default: "" },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  radius: { type: Number, required: true, min: 0 },
  otpEmail: { type: String, trim: true, lowercase: true, default: "" },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
};

const locationModel = new ajModel("Location", locationSchemaDefinition);
locationModel.schema.index({ vendorCode: 1, name: 1 });
locationModel.schema.index({ vendorCode: 1, aliases: 1 });

module.exports = locationModel.getModel();
