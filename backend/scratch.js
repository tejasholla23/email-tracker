const mongoose = require('mongoose');
const App = require('./models/Application');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const doc = await App.findOne().lean();
    console.log("Before events length:", doc.events ? doc.events.length : 0);
    
    // Update without $set
    await App.findByIdAndUpdate(doc._id, { status: "testing_update" }, { new: true });
    
    const docAfter = await App.findById(doc._id).lean();
    console.log("After events length:", docAfter.events ? docAfter.events.length : 0);
    
    // Restore
    await App.findByIdAndUpdate(doc._id, { status: doc.status });
    
    process.exit();
  })
  .catch(e => console.error(e));
