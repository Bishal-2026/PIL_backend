const { ajModel, mongoose } = require("../../common/classes/Model");

const demoResponseSchemaDefinition = {
  name: { type: String, trim: true, required: true },
  company: { type: String, trim: true, required: true },
  email: { type: String, trim: true, required: true },
  message: { type: String, trim: true },
  requestDemo: { type: Boolean, default: false },
};

const demoResponseModel = new ajModel("DemoResponse", demoResponseSchemaDefinition);

module.exports = demoResponseModel.getModel();
