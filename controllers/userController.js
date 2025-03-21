// controllers/userController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { validationResult, body } = require('express-validator');
const { User, Session } = require('../models');
const { Op, ValidationError } = require('sequelize');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET
const SESSION_EXPIRY_HOURS = 168; // e.g., 7 days
const PASSWORD_RESET_TOKEN_EXPIRY = 3600; // Token expiry in seconds (1 hour)
// API ROUTE: ./api/users
//const User = require('../models/user')
const dt = require('../toolbox/dispensaryTools')
const AppError = require('../toolbox/appErrorClass');
const { now } = require('sequelize/lib/utils');


exports.login = [
  body('email').isEmail().withMessage('Invalid email format'),
  body('password').notEmpty().withMessage('Password is required'),

  async (req, res, next) => {
    // Validate request body
    const { email, password } = req.body;

    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
          throw new AppError('Validation Error', 400, { field: 'errors', issue: 'Validation Errors Occurred', errors });
        }

      // Find user by email
      const user = await User.findOne({ where: { email: email } });
      if (!user) {
        throw new AppError('Unauthenticated request', 400, { field: 'businessProfile', issue: 'Incorrect Email or Password' });
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new AppError('Unauthenticated request', 400, { field: 'businessProfile', issue: 'Incorrect Email or Password' });
      }

      // Check for an existing session
      const existingSession = await Session.findOne({
        where: {
          userId: user.id,
          expiresAt: { [Op.gt]: new Date() }, // Only find sessions that haven't expired
        },
      });

      if (existingSession) {
        // Use the existing session
        return res.status(200)
          .set('Authorization', `Bearer ${existingSession.sessionId}`)
          .json({
            sessionId: existingSession.sessionId,
            user: user,
            expiresAt: existingSession.expiresAt.toISOString(),
          });
      }

      // Create session data
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
      const sessionToken = jwt.sign({ sessionId, userId: user.id }, JWT_SECRET, {
        expiresIn: `${SESSION_EXPIRY_HOURS}h`,
      });

      // Save session in the database
      await Session.create({
        sessionId,
        sessionToken,
        userId: user.id,
        createdAt: new Date(),
        expiresAt,
      });

      // Respond with session details
      return res.status(200)
        .set('Authorization', `Bearer ${sessionId}`)
        .json({
          sessionId,
          user: user,
          expiresAt: expiresAt.toISOString(),
        });
    } catch (error) {
      next(error)
    }
  }
];

exports.logout = async (req, res, next) => {
  try {
    await Session.destroy({
      where: { sessionId: req.session.sessionId },
    });

    return res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    next(error)
  }
};


exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'fname', 'lname', 'email', 'dob', 'country', 'phone', 'points', 'createdAt']
    });

    if (!users) {
      throw new AppError('Not Found', 404, { field: 'user', issue: 'Error fetching users' });
    }

    res.json(users)
  } catch (error) {
    next(error)
  }
}


exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: ['id', 'fname', 'lname', 'email', 'dob', 'country', 'phone', 'points', 'createdAt']
    });

    if (!user) {
      throw new AppError('Not Found', 404, { field: 'user', issue: 'User not found' });
    }

    res.json(user)
  } catch (error) {
    next(error)
  }
}


exports.getUserByEmail = async (req, res, next) => {
  const { email } = req.body
  try {
    const user = await User.findOne({
      where: {
        email: email,
        business_id: req.business_id
      },
      attributes: ['id', 'fname', 'lname', 'email', 'dob', 'country', 'phone', 'points', 'createdAt']
    });

    if (!user) {
      throw new AppError('Not Found', 404, { field: 'user', issue: 'User not found' });
    }

    res.json(user)
  } catch (error) {
    next(error)
  }
}


exports.getUserByPhone = async (req, res, next) => {
  const { phone } = req.body
  try {
    const user = await User.findOne({
      where: {
        phone: phone,
        business_id: req.business_id
      },
      attributes: ['id', 'fname', 'lname', 'email', 'dob', 'country', 'phone', 'points', 'createdAt']
    });

    if (!user) {
      throw new AppError('Not Found', 404, { field: 'user', issue: 'User not found' });
    }

    res.json(user)
  } catch (error) {
    next(error)
  }
}


exports.registerUser = async (req, res, next) => {
  try {
    let { fname, lname, email, password } = req.body
    let pw = await dt.hashUserPassword(password)

    const newUser = await User.create({ fname, lname, email, password: pw })

    const responseUser = {
      id: newUser.id,
      fname: newUser.fname,
      lname: newUser.lname,
      email: newUser.email,
      createdAt: newUser.createdAt,
    };

    res.status(201).json(responseUser);
  } catch (error) {
    res.status(500).json({ error: `${error}` })
  }
}


exports.deleteUser = async (req, res, next) => {
  const userId = req.params.id

  try {
    const user = await User.findByPk(userId)

    if (!user) {
      throw new AppError('Not Found', 404, { field: 'result', issue: 'User Not Found' });
    }

    await user.destroy()
    res.status(200).json({ message: `User with ID ${userId} deleted successfully` })

  } catch (error) {
    next(error)
  }
}


exports.addPoints = async (req, res, next) => {
  let { userId, amount } = req.body
  try {

    if (amount <= 0) {
      throw new AppError('Invalid Amount', 400, { field: 'amount', issue: 'Amount must be a positive number' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError('Invalid User', 404, { field: 'userId', issue: 'User does not exist' });
    }

    let result = await dt.incrementUserPoints(userId, amount, req.business_id)

    if (!result) {
      throw new AppError('Server Error', 500, { field: 'result', issue: 'Error Adding Points' });
    }

    res.status(200).json({ userId: `${userId}`, points_added: `${result}` })
  }
  catch (error) {
    next(error)
  }
}


exports.redeemPoints = async (req, res, next) => {
  let { userId, amount } = req.body
  try {

    if (amount <= 0) {
      throw new AppError('Invalid Amount', 400, { field: 'amount', issue: 'Amount must be a positive number' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError('Invalid User', 404, { field: 'userId', issue: 'User does not exist' });
    }

    const currentPoints = await dt.getUserPoints(userId, req.business_id);
    if (currentPoints < amount) {
      throw new AppError('Insufficient Points', 400, {
        field: 'amount',
        issue: 'User does not have enough points to redeem',
      });
    }

    let result = await dt.decrementUserPoints(userId, amount, req.business_id)

    if (!result) {
      throw new AppError('Server Error', 500, { field: 'result', issue: 'Error Redeeming Points' });
    }

    res.status(200).json({ userId: `${userId}`, points_redeemed: `${result}` })
  }
  catch (error) {
    next(error)
  }
}


exports.sendResetPassword = async (req, res, next) => {
  try {
    const { email, business_id } = req.body;

    if (!email) {
      throw new AppError('Invalid Request', 400, { field: 'password', issue: 'Email is required' });
    }

    // Find the user by email
    const user = await User.findOne({
      where: {
        email,
        business_id: business_id
      }
    });

    if (!user) {
      // Respond with success even if the email doesn't exist (avoid enumeration)
      return res.status(200).json({
        message: 'If this email is registered, a reset link has been sent.',
      });
    }

    // Generate a secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + PASSWORD_RESET_TOKEN_EXPIRY * 1000; // 1-hour expiry

    // Save the reset token and expiry in the database
    user.reset_token = resetToken;
    user.reset_token_expiry = resetTokenExpiry;
    await user.save();

    // Generate the reset link
    // const resetLink = `myapp://auth?mode=reset-password&token=${resetToken}`;

    //const resetLink = `http://localhost:8101/auth?mode=reset-password&token=${resetToken}`;
    const resetLink = `https://dispensary-api-ac9613fa4c11.herokuapp.com/api/users/redirect?token=${resetToken}`;

    // Send the reset link via email
    await dt.sendEmail({
      to: email,
      subject: 'Reset Your Password',
      text: `You requested a password reset. Click the link to reset your password: ${resetLink}`,
      html: `
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetLink}" style="color: blue; text-decoration: underline;">
          Reset Your Password
        </a>
        <p>If the above link does not work, copy and paste the following into your browser:</p>
        <p>${resetLink}</p>
      `,
    });
    

    // Respond with success
    return res.status(200).json({
      message: 'If this email is registered, a reset link has been sent.',
    });
  } catch (error) {
    next(error)
  }
};


exports.handleResetPasswordRedirect = async (req, res) => {
  const { token } = req.query;

  const deepLink = `flowerPower://auth?mode=reset-password&token=${token}`;
  return res.redirect(deepLink);
};


exports.resetPassword = async (req, res, next) => {
  let { password } = req.body;

  try {
    // Validate required fields
    if (!password) {
      throw new AppError('Invalid Request', 400, { field: 'password', issue: 'New Password is required' });
    }

    const user = req.user;

    // Hash the new password
    const hashedPassword = await dt.hashUserPassword(password);

    // Update the user's password and clear the reset token fields
    user.password = hashedPassword;
    user.reset_token = null; // Clear the token
    user.reset_token_expiry = null; // Clear the expiry
    await user.save();

    res.status(200).json({ message: 'Password reset successful.' });
  } catch (error) {
    next(error)
  }
};


exports.validateResetToken = async (req, res, next) => {
  const { token } = req.params; // Get token from route parameters

  try {
    await validateResetToken(token); // Validate the token
    res.status(200).json({ message: 'Token is valid.' });
  } catch (error) {
    next(error); // Forward error to centralized error handler
  }
};



exports.toggleNotifications = async (req, res, next) => {
  const { userId } = req.body; // Extract userId from the request body

  try {
    // Find the user by their ID
    const user = await User.findOne({ where: { id: userId } });

    if (!user) {
      throw new AppError('Not Found', 400, { field: 'user', issue: 'User not found.' });
    }

    // Toggle the notifications field
    const newNotificationSetting = !user.allow_notifications;

    // Update the user's notification setting in the database
    user.allow_notifications = newNotificationSetting;
    await user.save();

    // Respond with success and the updated notification setting
    res.status(200).json({
      message: 'Notification settings updated successfully.',
      user: user,
      notificationsEnabled: newNotificationSetting,
    });
  } catch (error) {
    next(error)
  }
};


exports.updateUser = async (req, res, next) => {
  // destructure all variables from the model, add new vars as the model's columns grow
  // password can not be reset via the UPDATE user, only through the reset password route
  let { id, fname, lname, email, dob, country, phone, points, business_id, referred_by, allow_notifications, premium, premium_start, premium_end } = req.body

  try {
    const user = await User.findByPk(id)

    if (!user) {
      throw new AppError('Not Found', 404, { field: 'user id', issue: 'User Not Found' });
    }

    const updateData = {}

    // check for each field if it was provided in req.body
    if (Object.hasOwn(req.body, 'fname')) updateData.fname = fname
    if (Object.hasOwn(req.body, 'lname')) updateData.lname = lname
    if (Object.hasOwn(req.body, 'email')) updateData.email = email
    if (Object.hasOwn(req.body, 'dob')) updateData.dob = dob
    if (Object.hasOwn(req.body, 'country')) updateData.country = country
    if (Object.hasOwn(req.body, 'phone')) updateData.phone = phone
    if (Object.hasOwn(req.body, 'points')) updateData.points = points
    if (Object.hasOwn(req.body, 'business_id')) updateData.business_id = business_id
    if (Object.hasOwn(req.body, 'referred_by')) updateData.referred_by = referred_by
    if (Object.hasOwn(req.body, 'allow_notifications')) updateData.allow_notifications = allow_notifications
    if (Object.hasOwn(req.body, 'premium')) updateData.premium = premium
    if (Object.hasOwn(req.body, 'premium_start')) updateData.premium_start = premium_start
    if (Object.hasOwn(req.body, 'premium_end')) updateData.premium_end = premium_end

    try {
      await user.update(updateData); // Validations in model will run here
    } catch (error) {
      console.log(error)
      if (error.name === 'SequelizeValidationError') {
        const validationErrors = error.errors.map((err) => ({
          field: err.path,
          message: err.message,
        }));
        throw new AppError('Validation Error', 400, validationErrors);
      }
      throw error; // Rethrow other errors
    }

    res.status(200).json({
      message: 'user updated successfully',
      user,
    });
  }
  catch (error) {
    next(error)
  }
}


exports.getUserPushToken = async (req, res) => {
  try {

    const { email } = req.body;

    const user = await User.findOne({ where: { email } }, { attributes: ['pushToken'] });

    if (!user) {
      throw new Error(`User with email ${email} not found`);
    }

    if (!user.pushToken) {
      throw new Error(`Push token not found for user with email ${email}`);
    }

    return user.pushToken;
  } catch (error) {
    console.error('Error retrieving push token:', error.message);
    throw error;
  }
}


exports.updateUserPushToken = async (req, res) => {
  try {
    const { email, token } = req.body;

    // Validate request parameters
    if (!email || !token) {
      return res.status(400).json({ message: 'Email and token are required.' });
    }

    // Find user by email
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: `User with email ${email} not found.` });
    }

    // Check if the token has changed
    if (user.pushToken !== token) {
      user.pushToken = token; // Update the push token
      await user.save();
      return res.status(200).json({ message: 'Push token updated successfully.' });
    }

    return res.status(200).json({ message: 'Push token is already up-to-date.' });
  } catch (error) {
    console.error('Error updating push token:', error.message);
    return res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
};


exports.upgradeUserMembership = async(req, res, next) => {
  let { phone, email } = req.body

  phone == undefined ? phone = '' : phone
  email == undefined ? email = '' : email

  try {
    const user = await User.findOne({
      where: {
        business_id: req.business_id,
        [Op.or]: [
          { phone: phone },
          { email: email }
        ]
      },
    })

    if (!user) {
      throw new AppError('Not Found', 404, { field: 'email or phone', issue: 'User Not Found' });
    }

    user.premium = true
    user.premium_start = new Date()
    user.premium_end.setFullYear(user.premium_start.getFullYear() + 1)

    await user.save()

    res.status(200).json({message: 'User membership upgraded'})

  } catch(error) {
    next(error)
  }
}


exports.downgradeUserMembership = async(req, res) => {
  let { phone, email } = req.body

  phone == undefined ? phone = '' : phone
  email == undefined ? email = '' : email

  try {
    const user = await User.findOne({
      where: {
        business_id: req.business_id,
        [Op.or]: [
          { phone: phone },
          { email: email }
        ]
      },
    })

    if (!user) {
      throw new AppError('Not Found', 404, { field: 'email or phone', issue: 'User Not Found' });
    }

    user.premium = false
    await user.save()

    res.status(200).json({message: 'User membership downgraded'})

  } catch(error) {
    next(error)
  }
}

