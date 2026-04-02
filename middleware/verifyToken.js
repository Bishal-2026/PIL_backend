const jwt = require("jsonwebtoken");
const JWT_SECRET =
  process.env.SECRET_KEY ||
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET;
const User = require("../Modules/user/model");

const verifyToken = (req, res, next) => {
  const rawHeader = req.headers.authorization;
  const token = rawHeader?.startsWith("Bearer ")
    ? rawHeader.replace("Bearer ", "")
    : rawHeader;

  if (!token) {
    return res
      .status(401)
      .json({ status: false, message: "Unauthorized Token: No token provided" });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .json({ status: false, message: "Token is invalid or expired" });
    }
    const lookup = decoded.userId ? { _id: decoded.userId } : { email: decoded.email };
    const user = await User.findOne(lookup);

    if (!user) {
      return res
        .status(401)
        .json({ status: false, message: "Unauthorized Token: User not found" });
    }

    req.user = user;
    next();
  });
};

module.exports = verifyToken;
