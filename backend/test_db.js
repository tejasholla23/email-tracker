const mongoose = require('mongoose');
const App = require('./models/Application');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const docs = await App.find({
      $or: [
        { link: { $regex: 'unstop', $options: 'i' } },
        { 'events.link': { $regex: 'unstop', $options: 'i' } }
      ]
    }).limit(3).lean();
    
    console.log("Unstop links:");
    console.log(JSON.stringify(docs.map(d => ({
      _id: d._id,
      company: d.company,
      link: d.link,
      events: d.events.filter(e => e.link && e.link.includes('unstop'))
    })), null, 2));
    
    process.exit();
  })
  .catch(e => console.error(e));
