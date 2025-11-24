// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
// Ensure this path matches your actual file structure (check uppercase/lowercase!)
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

    // 2. If no token found, return 401
    if (!token) {
      return res.status(401).json({ 
        status: 'fail', 
        message: 'You are not logged in' 
      });
    }

    // 3. Verify Token
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return reject(err); // This will jump to the catch block
        resolve(payload);
      });
    });

    // 4. Check if User still exists
    const currentUser = await User.findById(decoded.id).select('+password');
    if (!currentUser) {
      return res.status(401).json({ 
        status: 'fail', 
        message: 'User no longer exists' 
      });
    }

    // 5. Grant Access
    // Attach user info to the request object for the next controller
    req.user = { 
      id: currentUser._id, 
      email: currentUser.email, 
      role: currentUser.role || 'user' 
    };
    
    next();

  } catch (err) {
    console.error("Auth Error:", err.message);

    // SPECIFIC ERROR HANDLING FOR EXPIRATION
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        status: 'fail', 
        message: 'jwt expired', // Frontend looks for this specific string
        code: 'TOKEN_EXPIRED'   // Optional: specific code for frontend logic
      });
    }

    // GENERIC ERROR HANDLING
    return res.status(401).json({ 
      status: 'fail', 
      message: 'Invalid token' 
    });
  }
};

// // src/middleware/authMiddleware.js
// const jwt = require('jsonwebtoken');
// const User = require('../models/user');

// const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// exports.protect = async (req, res, next) => {
//   try {
//     let token;
//     if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
//       token = req.headers.authorization.split(' ')[1];
//     } else if (req.cookies && req.cookies.jwt) {
//       token = req.cookies.jwt;
//     }

//     if (!token) return res.status(401).json({ status: 'fail', message: 'You are not logged in' });

//     const decoded = await new Promise((resolve, reject) => {
//       jwt.verify(token, JWT_SECRET, (err, payload) => {
//         if (err) return reject(err);
//         resolve(payload);
//       });
//     });

//     const currentUser = await User.findById(decoded.id).select('+password');
//     if (!currentUser) return res.status(401).json({ status: 'fail', message: 'User no longer exists' });

//     // attach user to request object
//     req.user = { id: currentUser._id, email: currentUser.email, role: currentUser.role || 'user' };
//     next();
//   } catch (err) {
//     console.error(err);
//     return res.status(401).json({ status: 'fail', message: 'Invalid token' });
//   }
// };
