const { ajModel } = require("../../common/classes/Model");

const roleSchema = {
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },

  description: {
    type: String,
    trim: true,
    default: "",
  },

  modules: {
    type: [String],   // better than plain Array
    default: [],
  },

  status: {
    type: String,
    enum: ["Active", "Disabled", "Blocked", "Trash"],
    default: "Active",
  },
};

const RoleModel = new ajModel("Role", roleSchema).getModel();

module.exports = RoleModel;
