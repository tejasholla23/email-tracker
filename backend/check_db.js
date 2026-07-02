require("dotenv").config();
const mongoose = require("mongoose");
const CompanyInfo = require("./models/CompanyInfo");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected successfully.");

  // Find any existing CompanyInfo for Atos
  const match = await CompanyInfo.findOne({ name: /atos/i });
  if (match) {
    console.log("Found existing Atos company info:", match);
    match.domain = "atos.net";
    match.logo = "https://logo.clearbit.com/atos.net";
    await match.save();
    console.log("Updated Atos company info successfully to:", match);
  } else {
    // If it doesn't exist, create it preemptively
    const created = await CompanyInfo.create({
      name: "Atos",
      domain: "atos.net",
      logo: "https://logo.clearbit.com/atos.net"
    });
    console.log("Created new Atos company info record:", created);
  }

  await mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
