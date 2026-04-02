const { ajModel, mongoose } = require("../../common/classes/Model");

const deviceEventSchemaDefinition = {
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: "UserDevice", required: true },
  event: { type: String, required: true, trim: true },
  cameraStatus: { type: String, trim: true },
  imagePath: { type: String, trim: true },
  name: { type: String, trim: true },
  employeeId: { type: String, trim: true, index: true },
  location: { type: String, trim: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null, index: true },
  codeId: { type: String, trim: true },
  policyVoilation: { type: Boolean, default: false },
  narrative: { type: String, trim: true },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
};

const deviceEventModel = new ajModel("DeviceEvent", deviceEventSchemaDefinition);
deviceEventModel.schema.index({ deviceId: 1, timestamp: -1 });
deviceEventModel.schema.index({ employeeId: 1, timestamp: -1 });

module.exports = deviceEventModel.getModel();
