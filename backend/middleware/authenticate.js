const { verifyAccessToken } = require("../utils/jwt");

function authenticate(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ message: "Authentication token is missing" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ message: "Invalid authorization header format. Expected Bearer <token>" });
  }

  const token = parts[1];

  try {
    const decoded = verifyAccessToken(token);
    req.userId = decoded.sub;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    let message = "Invalid token";
    if (error.name === "TokenExpiredError") {
      message = "Token has expired";
    }
    return res.status(401).json({ message });
  }
}

module.exports = authenticate;
