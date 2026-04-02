const { ajModel, mongoose } = require("../../common/classes/Model");

const qrTokenSchemaDefinition = {
  tokenId: { type: String, required: true, unique: true, index: true },
  action: { type: String, enum: ["login", "logout"], required: true },
  location: { type: mongoose.Schema.Types.Mixed, default: null },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
};

const qrTokenModel = new ajModel("QrToken", qrTokenSchemaDefinition);
qrTokenModel.schema.index({ expiresAt: 1 });
qrTokenModel.schema.index({ usedAt: 1 });

module.exports = qrTokenModel.getModel();
