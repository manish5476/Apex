// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) return res.status(401).json({ status: 'fail', message: 'You are not logged in' });

    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return reject(err);
        resolve(payload);
      });
    });

    const currentUser = await User.findById(decoded.id).select('+password');
    if (!currentUser) return res.status(401).json({ status: 'fail', message: 'User no longer exists' });

    // attach user to request object
    req.user = { id: currentUser._id, email: currentUser.email, role: currentUser.role || 'user' };
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ status: 'fail', message: 'Invalid token' });
  }
};
