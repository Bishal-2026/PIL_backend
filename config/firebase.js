const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pidilite-cd009-default-rtdb.firebaseio.com",
});

module.exports = admin;
