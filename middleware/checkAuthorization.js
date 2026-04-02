// const permissions = require('../config/permissions.json');

// // HTTP method to action mapping
// const methodToAction = {
//   POST: "create",
//   GET: "read",
//   PUT: "update",
//   DELETE: "delete",
// };

// // Helper to extract module from request URL
// const extractModuleFromUrl = (url) => {
//   const parts = url.split("/").filter(Boolean); // Remove empty strings
//   const apiIndex = parts.indexOf("api");
//   if (apiIndex !== -1 && parts.length > apiIndex + 1) {
//     return parts[apiIndex + 1]; // /api/<module>/...
//   }
//   return null;
// };

// const checkAuthorization = (allowedRoles = [], module = null, customAction = null) => {
//   return (req, res, next) => {
//     const user = req.user;

//     if (!user || !user.role) {
//       return res.status(401).json({ status: false, message: "Unauthorized: No user role found" });
//     }

//     const userRole = user.role;

//     allowedRoles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
//     // Always allow super_admin by default
//     const allRoles = [...allowedRoles, "super_admin"];
//     if (!allRoles.includes(userRole)) {
//       return res.status(403).json({ status:false, message: "Forbidden: Role not allowed" });
//     }

//     // Dynamically determine module and action
//     const resolvedModule = module || extractModuleFromUrl(req.originalUrl);
//     const resolvedAction = customAction || methodToAction[req.method];

//     if (resolvedModule && resolvedAction) {
//       const rolePermissions = permissions[userRole]?.modules;

//       if (
//         !rolePermissions ||
//         !rolePermissions[resolvedModule] ||
//         !rolePermissions[resolvedModule].includes(resolvedAction)
//       ) {
//         return res.status(403).json({
//           status: "error",
//           message: `Forbidden: ${userRole} does not have '${resolvedAction}' access to '${resolvedModule}'`,
//         });
//       }
//     }

//     next();
//   };
// };

// module.exports = checkAuthorization;
const permissions = require("../config/permissions.json");

const ROLE_ALIASES = {
  super_admin: "superadmin",
  "super admin": "superadmin",
  superadmin: "superadmin",
  admin: "admin",
  hr: "hr",
  hrmanager: "hr",
  "hr manager": "hr",
  hr_manager: "hr",
  supervisor: "supervisor",
  manager: "manager",
  employee: "employee",
  contractor: "contractor",
};

const normalizeRole = (role) => {
  const raw = String(role || "").trim().toLowerCase();
  if (!raw) return "";
  if (ROLE_ALIASES[raw]) return ROLE_ALIASES[raw];

  const compact = raw.replace(/[\s_]+/g, "");
  if (ROLE_ALIASES[compact]) return ROLE_ALIASES[compact];

  // Try matching to a known role key in permissions.json
  const knownRoles = Object.keys(permissions || {});
  const match = knownRoles.find((r) => r.replace(/[\s_]+/g, "") === compact);
  return match || raw;
};

// HTTP method to action mapping
const methodToAction = {
  POST: "create",
  GET: "read",
  PUT: "update",
  DELETE: "delete",
};

// Helper to extract module from request URL
const extractModuleFromUrl = (url) => {
  const parts = url.split("/").filter(Boolean); // Remove empty strings
  const apiIndex = parts.indexOf("api");
  if (apiIndex !== -1 && parts.length > apiIndex + 1) {
    return parts[apiIndex + 1]; // /api/<module>/...
  }
  return null;
};

// Helper to check if user belongs to department or sub-department
const isUserInDepartment = (userDepartments, dataDepartmentId) => {
  return userDepartments.includes(dataDepartmentId);
};

const checkAuthorization = (
  allowedRoles = [],
  module = null,
  customAction = null
) => {
  return async (req, res, next) => {
    const user = req.user;

    if (!user || !user.role) {
      return res
        .status(401)
        .json({ status: false, message: "Unauthorized: No user role found" });
    }

    const userRole = normalizeRole(user.role);

    allowedRoles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);
    // Always allow superadmin by default
    const allRoles = [...normalizedAllowedRoles, "superadmin"];
    if (!allRoles.includes(userRole)) {
      return res
        .status(403)
        .json({ status: false, message: "Forbidden: Role not allowed" });
    }

    // Dynamically determine module and action
    const resolvedModule = module || extractModuleFromUrl(req.originalUrl);
    const resolvedAction = customAction || methodToAction[req.method];

    if (resolvedModule && resolvedAction) {
      const rolePermissions = permissions[userRole]?.modules;

      // Check for global permissions for the module
      if (
        !rolePermissions ||
        !rolePermissions[resolvedModule] ||
        !rolePermissions[resolvedModule].includes(resolvedAction)
      ) {
        return res.status(403).json({
          status: "error",
          message: `Forbidden: ${userRole} does not have '${resolvedAction}' access to '${resolvedModule}'`,
        });
      }

      // Now, check if user can access data based on their department/sub-department
      if (
        resolvedAction === "read" ||
        resolvedAction === "update" ||
        resolvedAction === "delete"
      ) {
        // Assume `data` in the route corresponds to the departmentId/subDepartmentId
        const dataDepartmentId =
          req.body.departmentId || req.params.departmentId; // Adjust based on your schema
        if (
          dataDepartmentId &&
          !isUserInDepartment(user.departments, dataDepartmentId)
        ) {
          return res.status(403).json({
            status: "error",
            message: `Forbidden: User does not have access to ${resolvedAction} data for the department`,
          });
        }
      }

      // Check for sub-department-level permissions if needed
      if (resolvedAction === "create") {
        const dataSubDepartmentId = req.body.subDepartmentId;
        if (
          dataSubDepartmentId &&
          !isUserInDepartment(user.departments, dataSubDepartmentId)
        ) {
          return res.status(403).json({
            status: "error",
            message: `Forbidden: User cannot create data in this sub-department`,
          });
        }
      }
    }

    next();
  };
};

module.exports = checkAuthorization;
