// utils/money.js
// Shared money helpers for the gambling commands.
//
// Balances are stored as decimal dollars (e.g. 12.34) but ALL arithmetic goes
// through integer cents. Doing it with plain floats drifts fast
// (0.1 + 0.2 === 0.30000000000000004), and that error compounds over payouts.

// Dollars -> whole cents (exact, rounds away float fuzz).
function toCents(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100);
}

// Whole cents -> dollars.
function fromCents(cents) {
  return cents / 100;
}

// Snap a dollar amount to the nearest cent.
function roundMoney(amount) {
  return fromCents(toCents(amount));
}

// Display form. Whole dollars drop the decimals, anything with cents keeps two:
//   5 -> "$5"        1.5 -> "$1.50"      0.01 -> "$0.01"
//   1234 -> "$1,234" 1234.5 -> "$1,234.50"
// toLocaleString also keeps very large payouts out of exponential notation.
function formatMoney(amount) {
  const cents = toCents(amount);
  const hasCents = cents % 100 !== 0;
  return `$${fromCents(cents).toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Validate a wager. Returns an error string, or null when the bet is fine.
 *
 * @param {number} amount   the wager
 * @param {number} balance  the player's balance
 * @param {object} opts
 * @param {boolean} opts.allowZero  allow a $0 "free play" bet
 */
function checkBet(amount, balance, { allowZero = true } = {}) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "That's not a valid bet amount.";
  }
  if (amount < 0) return "❌ Bet amount cannot be negative.";
  if (!allowZero && amount === 0) return "❌ You have to bet more than $0.00.";
  // Reject sub-cent precision rather than silently rounding someone's money.
  if (toCents(amount) !== Number((amount * 100).toFixed(4))) {
    return "❌ Bets only go down to the cent (2 decimal places).";
  }
  if (amount > 0 && toCents(amount) < 1) {
    return "❌ The smallest bet is $0.01.";
  }
  if (toCents(amount) > toCents(balance)) {
    return `❌ You don't have enough coins! Your balance is ${formatMoney(balance)}.`;
  }
  return null;
}

module.exports = { toCents, fromCents, roundMoney, formatMoney, checkBet };
