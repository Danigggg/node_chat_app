// Import Firebase Admin
const admin = require("firebase-admin");
// Import your service account JSON
const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Export admin to use in other files
module.exports = admin;
