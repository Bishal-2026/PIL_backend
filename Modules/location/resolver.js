const LocationModel = require("./model");

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalize = (value) => String(value || "").trim();

/**
 * Resolve a Location doc from a location string (name or alias).
 * Keeps backward compatibility with older app builds that send location names.
 */
const resolveLocationByNameOrAlias = async ({ location, vendorCode } = {}) => {
  const name = normalize(location);
  if (!name) return null;

  const normalizedVendorCode = normalize(vendorCode).toUpperCase();
  const exactRegex = new RegExp(`^${escapeRegExp(name)}$`, "i");

  const query = {
    $or: [{ name: exactRegex }, { aliases: exactRegex }],
    ...(normalizedVendorCode ? { vendorCode: normalizedVendorCode } : {}),
  };

  const record = await LocationModel.findOne(query)
    .select("_id name vendorCode aliases")
    .lean();
  return record || null;
};

module.exports = {
  resolveLocationByNameOrAlias,
};

