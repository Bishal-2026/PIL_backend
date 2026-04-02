const EmployeeModel = require("../Modules/employees/model");

const normalizeLocation = (value) => String(value || "").trim();

const normalizeRole = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const compact = raw.replace(/[\s_]+/g, "");
  if (compact === "hrmanager") return "hr";
  return compact;
};

const resolveUserLocation = async (user = {}) => {
  const directLocation = normalizeLocation(user.location);
  const directLocationId = user.locationId || null;

  if (directLocationId) {
    return { name: directLocation, id: directLocationId };
  }

  if (directLocation) {
    return { name: directLocation, id: null };
  }

  const employeeId = normalizeLocation(user.employeeId);
  if (!employeeId) {
    return { name: "", id: null };
  }

  const employee = await EmployeeModel.findOne({ employeeId }).select("location locationId").lean();
  return {
    name: normalizeLocation(employee?.location),
    id: employee?.locationId || null
  };
};

const resolveLocationScope = async (req) => {
  const role = normalizeRole(req.user?.role);
  const isSuperadmin = role === "superadmin";

  if (isSuperadmin) {
    return { role, isAdmin: false, isSuperadmin: true, location: "", locationId: null };
  }

  // Location-scoped roles (see controllers that check `scope.isAdmin` to apply filters)
  const isScopedRole = ["admin", "hr", "manager", "supervisor"].includes(role);
  if (!isScopedRole) {
    return { role, isAdmin: false, isSuperadmin: false, location: "", locationId: null };
  }

  const scope = await resolveUserLocation(req.user);
  if (!scope.name && !scope.id) {
    const error = new Error("User location is not configured");
    error.statusCode = 403;
    throw error;
  }

  return {
    role,
    isAdmin: true,
    isSuperadmin: false,
    location: scope.name,
    locationId: scope.id
  };
};

const assertScopedLocation = (recordLocation, scope, message) => {
  if (!scope?.isAdmin) return;
  const normalizedRecordLocation = normalizeLocation(recordLocation);
  if (normalizedRecordLocation !== scope.location) {
    const error = new Error(message || "You can only access your assigned location data");
    error.statusCode = 403;
    throw error;
  }
};

module.exports = {
  normalizeLocation,
  resolveUserLocation,
  resolveLocationScope,
  assertScopedLocation,
};
