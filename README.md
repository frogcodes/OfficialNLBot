# NLBot 🚀

A Discord bot built to manage **Nature League** — a community Rocket League organization. NLBot handles everything from league transactions and score reporting to an in-server economy and scheduling.

## Features

### 🏆 League Management

- **Score Reporting** — Submit and track match results with Ballchasing.com integration
- **Standings** — View up-to-date league standings
- **Scheduling** — Schedule matches and track unscheduled games
- **Forfeit** — Handle forfeit submissions
- **Draft** — Draft system for team building
- **Franchises** — Browse and manage franchises

### 👥 Transactions

- **Sign / Drop** — Sign and drop players from rosters
- **Trade** — Process trades between teams
- **Offer** — Send and manage offers to players
- **Promote / Demote** — Adjust player tiers
- **Re-sign** — Re-sign players to teams
- **Enroll** — Enroll players into the league with Auto SAL support

### 💰 Economy

- **Balance** — Check your in-server currency balance
- **Daily / Hourly** — Claim periodic currency rewards
- **Pay** — Transfer currency between users
- **Donate** — Donate currency to other players
- **Leaderboard** — See the top earners in the server

### 🎮 Mini Games

- **Duel** — Challenge other users to a duel
- **Roulette** — Try your luck at roulette
- **Slots** — Spin the slot machine
- **Coinflip** — Flip a coin
- **Scramble** — Unscramble word game
- **RPS** — Rock Paper Scissors

### 🔧 Admin & Utilities

- **Thread Management** — Auto-create and manage league/scheduling threads
- **Transaction Scraping** — Scrape and log transactions
- **SAL Announcements** — Announce SAL results
- **Nickname Cleanup** — Bulk clean player nicknames
- **Clear Season** — End of season cleanup tools
- **Profile** — View player profiles
- **Name Requests** — Request nickname changes

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A Discord bot token
- A [Ballchasing.com](https://ballchasing.com) API token
- A Google Service Account with Sheets API access

### Installation

```bash
git clone https://github.com/frogcodes/OfficialNLBot.git
cd OfficialNLBot
npm install
```

### Configuration

Create a `.env` file in the root directory:

```env
token=YOUR_DISCORD_BOT_TOKEN
BALLCHASING_TOKEN=YOUR_BALLCHASING_TOKEN
```

Add your Google Service Account credentials JSON file to the root directory and reference it in the relevant commands.

### Deploy Commands

```bash
node deploy-commands.js
```

### Run the Bot

```bash
node index.js
```

## Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Open a Pull Request

Please do **not** commit directly to `main`.

## Environment Variables

| Variable            | Description               |
| ------------------- | ------------------------- |
| `token`             | Discord bot token         |
| `BALLCHASING_TOKEN` | Ballchasing.com API token |

## License

This project is private and maintained by the Nature League community.
