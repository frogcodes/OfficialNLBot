const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  matchday: {
    type: Number,
    required: true
  },
  week: {
    type: Number,
    required: true
  },
  tier: {
    type: String,
    required: true,
    enum: ['apex', 'alpha', 'beta', 'delta', 'omega']
  },
  team1: {
    type: String,
    required: true
  },
  team2: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: null
  },
  time: {
    type: String,
    default: null
  },
  scheduled: {
    type: Boolean,
    default: false
  },
  messageId: {
    type: String,
    default: null
  },
  season: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model('Schedule', MatchSchema);
