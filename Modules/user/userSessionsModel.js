const { ajModel, mongoose } = require("../../common/classes/Model");

const userSessionSchemaDefinition = {
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    index: true,
  },
  deviceId: { type: String, trim: true, index: true, default: null },
  employeeId: { type: String, trim: true, index: true },
  action: {
    type: String,
    enum: ["Logged In", "Logout"],
    required: true,
  },
  token: { type: String, trim: true, default: null },
  location: { type: mongoose.Schema.Types.Mixed, default: null },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null, index: true },
  deviceLocation: { type: mongoose.Schema.Types.Mixed, default: null },
  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
};

const userSessionModel = new ajModel("UserSession", userSessionSchemaDefinition);
userSessionModel.schema.index({ userId: 1, createdAt: -1 });

module.exports = userSessionModel.getModel();
