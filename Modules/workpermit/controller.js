const WorkPermit = require("./model");

// Helper to generate Permit ID
const generatePermitId = async () => {
    // WP- random 6 digit
    return `WP-${Math.floor(Math.random() * 900000 + 100000)}`;
};

exports.getAll = async (req, res) => {
  try {
    const permits = await WorkPermit.find().sort({ date: -1 });
    res.status(200).json({ status: true, data: permits });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const permit = await WorkPermit.findById(req.params.id);
    if (!permit) {
      return res.status(404).json({ status: false, message: "Permit not found" });
    }
    res.status(200).json({ status: true, data: permit });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const permitData = { ...req.body };
    if (!permitData.permitId) {
        permitData.permitId = await generatePermitId();
    }
    const permit = await WorkPermit.create(permitData);
    res.status(201).json({ status: true, data: permit });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const permit = await WorkPermit.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!permit) {
      return res.status(404).json({ status: false, message: "Permit not found" });
    }
    res.status(200).json({ status: true, data: permit });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const permit = await WorkPermit.findByIdAndDelete(req.params.id);
    if (!permit) {
      return res.status(404).json({ status: false, message: "Permit not found" });
    }
    res.status(200).json({ status: true, message: "Permit deleted successfully" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
