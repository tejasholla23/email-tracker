const mongoose = require('mongoose');
const Application = require('./models/Application');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const apps = await Application.find({ company: "ABB" }).limit(1);
    if (apps.length > 0) {
      console.log("ABB App found:");
      console.log(JSON.stringify(apps[0], null, 2));
    } else {
      console.log("ABB app not found.");
    }
    mongoose.disconnect();
  });
