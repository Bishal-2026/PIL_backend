const path = require("path");
const fs = require("fs");
const uploadsModel = require("./model.js");
const UserModel = require("../user/model.js");
const { resolveSubdir } = require("./middleware");

// ✅ Upload file and store in DB
exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: false, message: "No file uploaded" });
    }

    const folder = resolveSubdir(req, req.file);
    const fileUrl = `/uploads/${folder}/${req.file.filename}`;

    // Save upload record in DB
    const uploadDoc = new uploadsModel({
      fileName: req.file.originalname,
      fileUrl,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user ? req.user._id : null,
      metadata: { folder },
    });

    await uploadDoc.save();

    // If it's a profile upload → update user's profileImage
    if (folder === "profile" && req.user) {
      await UserModel.findByIdAndUpdate(
        req.user._id,
        { profileImage: fileUrl },
        { new: true }
      );
    }

    return res.status(200).json({
      status: true,
      message: "File uploaded successfully",
      data: uploadDoc,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// ✅ Get file by folder + filename
exports.getFile = (req, res) => {
  const { folder, filename } = req.params;
  const filePath = path.join(__dirname, "../../uploads", folder, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ status: false, message: "File not found" });
  }
};
