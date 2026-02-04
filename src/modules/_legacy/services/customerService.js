// Services/customerService.js
const Customer = require('../../organization/core/customer.model');
const fileUploadService = require('./uploads/fileUploadService');
const AppError = require('../../../core/utils/appError');


exports.uploadCustomerProfileImage = async (customerId, file, user) => {
    if (!file) {throw new AppError("No image file was provided for upload.", 400);}
    const filePath = `customer-profiles/${customerId}/${Date.now()}-${file.originalname}`;
    const publicUrl = await fileUploadService.uploadFile(
        file.buffer,
        filePath,
        file.mimetype
    );
    const ownerFilter = user.role === 'superAdmin' ? {} : { owner: user._id };
    const customer = await Customer.findOne({ _id: customerId, ...ownerFilter });
    if (!customer) { throw new AppError("Customer not found or you do not have permission to update.", 404);}
    customer.profileImg = publicUrl;
    await customer.save();
    return customer;
};