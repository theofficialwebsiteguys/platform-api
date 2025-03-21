// ./api/users

const express = require('express')
const userController = require('../controllers/userController')
const { authenticateRequest, validateResetToken } = require('../middleware/authMiddleware');

const router = express.Router()

router.post('/login', userController.login)
router.post('/register', userController.registerUser)
router.post('/forgot-password', userController.sendResetPassword)

router.get('/redirect', userController.handleResetPasswordRedirect)
router.post('/reset-password', validateResetToken, userController.resetPassword)
router.get('/validate-reset-token', validateResetToken, (req, res) => {
    res.status(200).json({ success: true, message: 'Reset token is valid.' });
});
  
router.use(authenticateRequest);

router.get('/validate-session', (req, res) => {
    res.status(200).json({ valid: true });
});

router.get('/', userController.getAllUsers)
router.get('/id/:id', userController.getUserById)
router.get('/email', userController.getUserByEmail)
router.delete('/delete/:id', userController.deleteUser)
router.post('/logout', userController.logout)
router.put('/update', userController.updateUser)


module.exports = router
