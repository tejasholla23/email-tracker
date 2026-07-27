require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected successfully.");

  const Account = require("./models/Account");
  const accounts = await Account.find();
  console.log("All accounts:", accounts.map(a => ({ _id: a._id, email: a.email })));

  const havellsApp = await Application.findOne({ company: "Havells" });
  if (havellsApp) {
    console.log("Havells Application ID:", havellsApp._id);
    console.log("Company:", havellsApp.company);
    console.log("Events:", JSON.stringify(havellsApp.events, null, 2));
  } else {
    console.log("No Havells application found.");
  }

  await mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
