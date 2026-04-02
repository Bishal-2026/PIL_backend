const { ajModel, mongoose } = require("../../common/classes/Model");

const policySchemaDefinition = {
  name: { type: String, required: true, trim: true },
  platform: { type: String, enum: ["android", "ios", "both"], default: "both" },
  rules: {
    cameraDisabled: { type: Boolean, default: false },
    uninstallBlocked: { type: Boolean, default: true },
    kioskMode: { type: Boolean, default: false },
    allowedApps: { type: [String], default: [] },
    blockedApps: { type: [String], default: [] },
    geofencing: {
      type: [
        {
          name: { type: String, trim: true },
          lat: { type: Number },
          lng: { type: Number },
          radiusMeters: { type: Number },
          cameraDisabled: { type: Boolean, default: false },
          kioskMode: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
  },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
};

const policyModel = new ajModel("Policy", policySchemaDefinition).getModel();
module.exports = policyModel;
