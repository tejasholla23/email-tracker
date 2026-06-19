const mongoose = require('mongoose');
require('dotenv').config();
const Application = require('./models/Application');

async function fixPeopleHum() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const res = await Application.deleteMany(
      { company: { $regex: /probationary|people/i } }
    );
    console.log("Deleted probationary applications:", res);
  } catch (e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
  }
}
fixPeopleHum();
