const { ajModel } = require("../common/classes/Model");

const templateSchema = {
  name: { type: String, required: true, unique: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
};

const TemplateModel = new ajModel("EmailTemplate", templateSchema).getModel();
module.exports = TemplateModel;
