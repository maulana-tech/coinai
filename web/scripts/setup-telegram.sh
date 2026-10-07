#!/usr/bin/env bash
# One-time Telegram bot setup: webhook + command menu + description.
# Usage (from web/): APP_URL=https://your-app.vercel.app ./scripts/setup-telegram.sh
# Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment or web/.env.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${TELEGRAM_BOT_TOKEN:?set TELEGRAM_BOT_TOKEN}" "${TELEGRAM_WEBHOOK_SECRET:?set TELEGRAM_WEBHOOK_SECRET}" "${APP_URL:?set APP_URL}"
API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

curl -fsS "$API/setWebhook" -H 'Content-Type: application/json' -d "{
  \"url\": \"${APP_URL%/}/api/telegram\",
  \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
  \"allowed_updates\": [\"message\"],
  \"drop_pending_updates\": true
}"; echo

curl -fsS "$API/setMyCommands" -H 'Content-Type: application/json' -d '{"commands": [
  {"command": "portfolio", "description": "Savings, positions (vaults + basket) and the AI strategy"},
  {"command": "agent", "description": "What your agents may do: skills, limits, Hermes"},
  {"command": "groups", "description": "Your groups: dues due, chip-ins, fundraisers"},
  {"command": "goals", "description": "Your savings goals and progress"},
  {"command": "badges", "description": "Your badges and saving streak"},
  {"command": "points", "description": "Referral points and your payment link"},
  {"command": "pools", "description": "Your saved pools (AI benchmark)"},
  {"command": "use", "description": "Make a pool the AI benchmark: /use <name> or /use off"},
  {"command": "deposit", "description": "How to add tUSDT or tBNB"},
  {"command": "market", "description": "Live market read (BNB, BTC, ETH, CAKE)"},
  {"command": "run", "description": "Run the agent team now"},
  {"command": "report", "description": "Today'"'"'s savings report"},
  {"command": "reset", "description": "Clear chat memory"},
  {"command": "stop", "description": "Stop reports and unlink"},
  {"command": "help", "description": "What I can do"}
]}'; echo

curl -fsS "$API/setMyDescription" -H 'Content-Type: application/json' -d '{"description": "coinAI: an AI agent team that saves and invests a slice of every payment on BNB Chain. Chat with it, check your portfolio, groups, goals and badges, switch your saved strategy, get daily reports and alerts, and read the market."}'; echo

curl -fsS "$API/getWebhookInfo"; echo
