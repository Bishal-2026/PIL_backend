const { ajModel, mongoose } = require("../../common/classes/Model"); // ✅ Only import the class

const permissionsSchemaDefinition = {
  role: {
    type: String,
    required: true,
    unique: true,
  },
  business_type: {
    type: String,
    required: true,
  },
  hierarchy: {
    type: Number,
    required: true,
  },
  modules: {
    type: Map,
    of: [String], // e.g., "attendance" => ["read", "create"]
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
};

// Optional transformation function
const permissionsTransform = (ret) => ({
  id: ret._id,
  role: ret.role,
  business_type: ret.business_type,
  hierarchy: ret.hierarchy,
  modules: ret.modules,
  metadata: ret.metadata,
});

const permissionsModel = new ajModel(
  "Permissions",
  permissionsSchemaDefinition,
  permissionsTransform
).getModel();
module.exports = permissionsModel;
