const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const platformDeliveryAgentSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  phone: { type: String, required: [true, 'Phone number is required'], unique: true, trim: true },
  password: { type: String, required: [true, 'Password is required'], select: false },
  
  // Location for assignment
  city: { type: String, required: [true, 'City is required'], trim: true },
  state: { type: String, required: [true, 'State is required'], trim: true },
  zipCode: { type: String, required: [true, 'Zip code is required'], trim: true },

  isActive: { type: Boolean, default: true },
  status: { 
    type: String, 
    enum: ['available', 'busy', 'offline'], 
    default: 'offline' 
  },
  
  vehicleType: { type: String, trim: true },
  licenseNumber: { type: String, trim: true },
}, { timestamps: true });

platformDeliveryAgentSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

platformDeliveryAgentSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('PlatformDeliveryAgent', platformDeliveryAgentSchema);
