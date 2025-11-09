const Customer = require('../models/customerModel');
const factory = require('../utils/handlerFactory');
exports.createCustomer = factory.createOne(Customer);
exports.getAllCustomers = factory.getAll(Customer);
exports.getCustomer = factory.getOne(Customer);
exports.updateCustomer = factory.updateOne(Customer);
exports.deleteCustomer = factory.deleteOne(Customer);
exports.restoreCustomer = factory.restoreOne(Customer);

// src/controllers/customerController.js
const { uploadImage } = require("../services/uploads");
const catchAsync = require("../utils/catchAsync");

exports.uploadCustomerImage = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError("Please upload an image", 400));

  const imageData = await uploadImage(req.file.buffer, "customers");
  const updatedCustomer = await Customer.findByIdAndUpdate(
    req.params.id,
    { avatar: imageData.url },
    { new: true }
  );

  res.status(200).json({
    status: "success",
    data: { customer: updatedCustomer },
  });
});
