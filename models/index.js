const sequelize = require('../db')
const { DataTypes } = require('sequelize')
const User = require('./user')
const Session = require('./session')
const Message = require('./message')


// FK for user_id on Session model
Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Session, { foreignKey: 'userId', as: 'Sessions' });

// Sync all models with the database
sequelize.sync({ alter: true }) // change to force: true to drop all data and tables and recreate based on model definitions
  .then(() => {
    console.log('Database & tables synced successfully')
  })
  .catch(error => {
    console.error('Error syncing database:', error)
  })

// Export models and sequelize instance
module.exports = {
  sequelize,
  User,
  Session,
  Message
}
