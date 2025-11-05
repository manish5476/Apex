const Customer = require('../models/customerModel');
const factory = require('../utils/handlerFactory');
exports.createCustomer = factory.createOne(Customer);
exports.getAllCustomers = factory.getAll(Customer);
exports.getCustomer = factory.getOne(Customer);
exports.updateCustomer = factory.updateOne(Customer);
exports.deleteCustomer = factory.deleteOne(Customer);
exports.restoreCustomer = factory.restoreOne(Customer);