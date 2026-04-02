const { ajModel, mongoose } = require("../../common/classes/Model");

const enquirySchemaDefinition = {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  employeeId: { type: String, trim: true, required: true },
  message: { type: String, trim: true, required: true },
};

const enquiryModel = new ajModel("Enquiry", enquirySchemaDefinition);

module.exports = enquiryModel.getModel();
