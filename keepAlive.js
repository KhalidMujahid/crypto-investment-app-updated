const https = require("https");

function keepAlive() {
  setInterval(() => {
    https.get("https://advancedstrading.onrender.com");
  }, 5 * 60 * 1000); 
}

module.exports = keepAlive;
