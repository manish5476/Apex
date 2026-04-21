const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const http = require('http');
dotenv.config({ path: './.env' });
async function run() {
  try {
    await mongoose.connect(process.env.DATABASE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to DB');
    const User = require('./modules/auth/core/user.model');
    const Session = require('./modules/auth/core/session.model');
    // Grab the first user
    const user = await User.findOne({ email: 'shivam.electronics.j@gmail.com' });
    if (!user) {
      console.log("User not found");
      process.exit(0);
    }

    const token = jwt.sign({ id: user._id, organizationId: user.organizationId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN
    });

    await Session.create({
      userId: user._id,
      token,
      isValid: true,
      browser: 'node',
      os: 'test',
      deviceType: 'web',
      ipAddress: '127.0.0.1',
      organizationId: user.organizationId,
      lastActivityAt: new Date()
    });

    console.log("Token generated.");

    // Fetch transactions
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1/transactions',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Response Status:', res.statusCode);
        console.log('Response Body:', data);
        process.exit(0);
      });
    });

    req.on('error', error => {
      console.error('Request Error:', error);
      process.exit(1);
    });

    req.end();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();
