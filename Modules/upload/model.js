const { ajModel, mongoose } = require("../../common/classes/Model"); // ✅ Only import the class

// const roomsSchemaDefinition = {
//   roomNumber: {
//     type: String,
//     required: true,
//     unique: true,
//     trim: true,
//   },
//   name: {
//     type: String,
//     required: true,
//     trim: true,
//   },
//   floor: {
//     type: Number,
//     required: true,
//   },
//   capacity: {
//     type: Number,
//     required: true,
//     min: 1,
//   },
//   type: {
//     type: String,
//     enum: [
//       "Classroom",
//       "Laboratory",
//       "Library",
//       "Office",
//       "Auditorium",
//       "Other",
//     ],
//     default: "Classroom",
//   },
//   isAvailable: {
//     type: Boolean,
//     default: true,
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
// };

// // Optional transformation function
// const roomsTransform = (ret) => ({
//   id: ret._id,
//   roomNumber: ret.roomNumber,
//   name: ret.name,
//   floor: ret.floor,
//   capacity: ret.capacity,
//   type: ret.type,
// });

// const roomsModel = new ajModel(
//   "Rooms",
//   roomsSchemaDefinition,
//   roomsTransform
// ).getModel();
// module.exports = roomsModel;



const uploadSchemaDefinition = {
  fileName: {
    type: String,
    required: true,
    trim: true,
  },
  fileUrl: {
    type: String,
    required: true,
    trim: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  size: {
    type: Number, // in bytes
    required: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
};

// Transform for API response
const uploadTransform = (ret) => ({
  id: ret._id,
  fileName: ret.fileName,
  fileUrl: ret.fileUrl,
  mimeType: ret.mimeType,
  size: ret.size,
  uploadedBy: ret.uploadedBy,
  createdAt: ret.createdAt,
  metadata: ret.metadata,
});

const uploadsModel = new ajModel(
  "Uploads",
  uploadSchemaDefinition,
  uploadTransform
).getModel();

module.exports = uploadsModel;