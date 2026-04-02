const { ajModel, mongoose } = require("../../common/classes/Model");

const permissionLogSchemaDefinition = {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  employeeId: { type: String, trim: true, index: true },
  permission: { type: String, trim: true, required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
};

const permissionLogModel = new ajModel(
  "PermissionLog",
  permissionLogSchemaDefinition
);

permissionLogModel.schema.index({ userId: 1, createdAt: -1 });
permissionLogModel.schema.index({ adminId: 1, createdAt: -1 });

module.exports = permissionLogModel.getModel();
