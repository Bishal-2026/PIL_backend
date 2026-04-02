const mongoose = require("mongoose"); // ✅ Import mongoose once

class ajModel {
  constructor(modelName, schemaDefinition, transformFn = null) {
    this.schema = new mongoose.Schema(schemaDefinition, {
      versionKey: false,
      timestamps: true, // Adds createdAt & updatedAt fields automatically
      toJSON: {
        transform: function (doc, ret,options) {
          return transformFn ? transformFn(ret,options) : ret;
        },
      },
    });

    this.model = mongoose.model(modelName, this.schema);
  }

  getModel() {
    return this.model;
  }
}

// ✅ Export both the class and mongoose
module.exports = { ajModel, mongoose };
