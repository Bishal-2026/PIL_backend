const { ajModel, mongoose } = require("../../common/classes/Model");

const mediaSubSchema = {
  url: { type: String, required: true, trim: true },
  thumbnail: { type: String, trim: true },
  type: { type: String, enum: ["screenshot", "photo", "video", "file"], default: "screenshot" },
  capturedAt: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
};

const activitySchemaDefinition = {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true, index: true },
  employeeId: { type: String, trim: true, index: true },
  deviceId: { type: String, trim: true, index: true },
  location: { type: String, trim: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null, index: true },
  category: {
    type: String,
    enum: ["camera", "app_install", "app_uninstall", "screenshot", "video", "other"],
    default: "other",
  },
  activityType: { type: String, trim: true },
  title: { type: String, trim: true },
  description: { type: String, trim: true },
  name: { type: String, trim: true },
  imagePath: { type: String, trim: true },
  media: { type: [mediaSubSchema], default: [] },
  occurredAt: { type: Date, default: Date.now },
  policyVoilation: { type: Boolean, default: false },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE" },
};

const activityModel = new ajModel("ActivityLog", activitySchemaDefinition);
activityModel.schema.index({ userId: 1, category: 1, occurredAt: -1 });
activityModel.schema.index({ deviceId: 1, occurredAt: -1 });
activityModel.schema.index({ employeeId: 1, occurredAt: -1 });

module.exports = activityModel.getModel();
