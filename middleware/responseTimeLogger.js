// middleware/responseTimeLogger.js
module.exports = function responseTimeLogger(req, res, next) {
    const start = process.hrtime();
  
    res.on("finish", () => {
      const diff = process.hrtime(start);
      const responseTimeMs = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2);
      console.log(`[${req.method}] ${req.originalUrl} - ${responseTimeMs} ms`);
    });
  
    next();
  };
  