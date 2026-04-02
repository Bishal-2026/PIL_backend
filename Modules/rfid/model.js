const { ajModel, mongoose } = require("../../common/classes/Model");

/* ===========================
   RFID Schema Definition
=========================== */
const rfidSchemaDefinition = {
  uid: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true, // fast lookup from reader
  },

  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    unique: true,     // one employee → one card
    sparse: true,    // allow unassigned cards
    index: true,
  },

  issuedAt: {
    type: Date,
    default: Date.now,
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },

  lostOrReplaced: {
    type: Boolean,
    default: false,
  },

  status: {
    type: String,
    enum: ["Active", "Disabled", "Lost", "Replaced"],
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
const rfidTransform = (ret) => {
  return {
    id: ret._id,
    uid: ret.uid,
    employeeId: ret.employeeId,
    isActive: ret.isActive,
    status: ret.status,
    issuedAt: ret.issuedAt,
    lostOrReplaced: ret.lostOrReplaced,
    metadata: ret.metadata,
    createdAt: ret.createdAt,
    updatedAt: ret.updatedAt,
  };
};

/* ===========================
   Model Creation
=========================== */
const RFIDModel = new ajModel(
  "RFID",
  rfidSchemaDefinition,
  rfidTransform
).getModel();

module.exports = RFIDModel;
