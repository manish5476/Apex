const mongoose = require('mongoose'); 
mongoose.connect('mongodb://manishSingh:ms201426@ac-peske3b-shard-00-00.ix9ivvl.mongodb.net:27017,ac-peske3b-shard-00-01.ix9ivvl.mongodb.net:27017,ac-peske3b-shard-00-02.ix9ivvl.mongodb.net:27017/?ssl=true&authSource=admin&retryWrites=true&w=majority&appName=ShivamElectronicsProd').then(async () => { 
  const SFCustomer = require('./src/PublicModules/models/storefront/storefrontCustomer.model');
  const sf = await SFCustomer.find({}).lean();
  console.log(sf.map(s => ({ id: s._id, firstName: s.firstName, lastName: s.lastName, email: s.email, name: s.name, converted: s.convertedToMainCustomer })));
  process.exit(0); 
});
