const roles = require('../utils/roles.js');

const grantAccess = (actions) => {
  return (req, res, next) => {
    const userRole = req.user.role;

    // Ensure the user role exists in the roles definition
    if (!roles[userRole]) {
      return res.status(403).json({status:false, message: 'Forbidden: Role not recognized' });
    }

    // Check if the user has at least one of the required permissions
    const hasPermission = actions.some(action => roles[userRole].can.includes(action));

    if (!hasPermission) {
      return res.status(403).json({status:false, message: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

module.exports = grantAccess;
