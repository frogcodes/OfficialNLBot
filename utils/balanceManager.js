const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../data/playerBalances.json");

// Get player's balance by ID
function getPlayerBalance(userId) {
  const balances = JSON.parse(fs.readFileSync(dataPath));
  const player = balances.find((entry) => entry.user === userId);
  return player ? player.balance : null;
}

// Update player's balance
function updatePlayerBalance(userId, newBalance) {
  const balances = JSON.parse(fs.readFileSync(dataPath));

  const index = balances.findIndex((entry) => entry.user === userId);
  if (index !== -1) {
    balances[index].balance = newBalance;
  } else {
    balances.push({ user: userId, balance: newBalance });
  }

  fs.writeFileSync(dataPath, JSON.stringify(balances, null, 2));
}

// Add (or subtract) amount from balance
function changePlayerBalance(userId, amount) {
  const current = getPlayerBalance(userId) ?? 0;
  updatePlayerBalance(userId, current + amount);
}

module.exports = {
  getPlayerBalance,
  updatePlayerBalance,
  changePlayerBalance,
};
