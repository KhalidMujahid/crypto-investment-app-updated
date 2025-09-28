const https = require("https");

function keepAlive() {
  setInterval(() => {
    https.get("https://advancedstrading.onrender.com", (res) => {
      console.log("Pinged site — status:", res.statusCode);
    }).on("error", (err) => {
      console.error("Ping failed:", err.message);
    });
  }, 3 * 60 * 1000);
}

module.exports = keepAlive;
