const { ajModel, mongoose } = require("../../common/classes/Model");

/* ===========================
   Section Schema Definition
=========================== */
const sectionSchemaDefinition = {
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true,
  },

  code: {
    type: String,
    trim: true,
    index: true,
  },

  description: {
    type: String,
    trim: true,
  },

  supervisorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true,
  },

  status: {
    type: String,
    enum: ["Active", "Inactive"],
    default: "Active",
    index: true,
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
};

/* ===========================
   Response Transform
=========================== */
const sectionTransform = (ret) => {
  return {
    id: ret._id,
    name: ret.name,
    code: ret.code,
    description: ret.description,
    supervisorId: ret.supervisorId,
    status: ret.status,
    metadata: ret.metadata,
    createdAt: ret.createdAt,
    updatedAt: ret.updatedAt,
  };
};

/* ===========================
   Model Creation
=========================== */
const SectionModel = new ajModel(
  "Section",
  sectionSchemaDefinition,
  sectionTransform
).getModel();

module.exports = SectionModel;
