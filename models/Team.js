const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  roleId: {
    type: String,
    required: true
  },
  members: {
    gm: {
      type: String,
      default: null
    },
    agm: {
      type: String,
      default: null
    },
    captains: [{
      type: String
    }]
  },
  tiers: [{
    type: String,
    enum: ['apex', 'alpha', 'beta', 'delta', 'omega']
  }]
});

module.exports = mongoose.model('Team', TeamSchema);
