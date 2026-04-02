const { ajModel, mongoose } = require("../../common/classes/Model");

/* ===========================
   Contractor Schema Definition
=========================== */
const contractorSchemaDefinition = {
  name: {
    type: String,
    required: true,
    trim: true,
  },

  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },

  contactPerson: {
    type: String,
    trim: true,
  },

  contactPhone: {
    type: String,
    trim: true,
  },

  gstNumber: {
    type: String,
    trim: true,
  },

  status: {
    type: String,
    enum: ["Active", "Inactive", "active", "inactive", "ACTIVE", "INACTIVE"],
    default: "Active",
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
};

/* ===========================
   Response Transform
=========================== */
const contractorTransform = (ret) => {
  return {
    id: ret._id,
    name: ret.name,
    code: ret.code,
    contactPerson: ret.contactPerson,
    contactPhone: ret.contactPhone,
    gstNumber: ret.gstNumber,
    status: ret.status,
    metadata: ret.metadata,
    createdAt: ret.createdAt,
    updatedAt: ret.updatedAt,
  };
};

/* ===========================
   Model Creation
=========================== */
const ContractorModel = new ajModel(
  "Contractor",
  contractorSchemaDefinition,
  contractorTransform
);

module.exports = ContractorModel.getModel();
