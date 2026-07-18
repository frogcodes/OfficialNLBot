const fs = require("fs");
const path = require("path");
const { toCents, fromCents, roundMoney } = require("./money");

const dataPath = path.join(__dirname, "../data/playerBalances.json");

// Get player's balance by ID
function getPlayerBalance(userId) {
  const balances = JSON.parse(fs.readFileSync(dataPath));
  const player = balances.find((entry) => entry.user === userId);
  return player ? player.balance : null;
}

// Update player's balance (always stored snapped to the cent)
function updatePlayerBalance(userId, newBalance) {
  const balances = JSON.parse(fs.readFileSync(dataPath));
  const rounded = roundMoney(newBalance);

  const index = balances.findIndex((entry) => entry.user === userId);
  if (index !== -1) {
    balances[index].balance = rounded;
  } else {
    balances.push({ user: userId, balance: rounded });
  }

  fs.writeFileSync(dataPath, JSON.stringify(balances, null, 2));
}

// Add (or subtract) amount from balance.
// Done in integer cents so repeated wins/losses can't accumulate float drift.
function changePlayerBalance(userId, amount) {
  const current = getPlayerBalance(userId) ?? 0;
  const next = fromCents(toCents(current) + toCents(amount));
  updatePlayerBalance(userId, next);
}

module.exports = {
  getPlayerBalance,
  updatePlayerBalance,
  changePlayerBalance,
};
