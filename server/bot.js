import { Telegraf } from 'telegraf';

let bot;

/**
 * Initializes and returns a Telegraf bot instance.
 * The bot is used for sending messages, not for receiving updates,
 * so bot.launch() is not necessary.
 * @param {string} token - The Telegram Bot API token.
 * @returns {Telegraf | undefined} The bot instance or undefined if no token is provided.
 */
function initializeBot(token) {
  if (token) {
    bot = new Telegraf(token);
    console.log('[BOT] Telegraf bot initialized.');
  }
  return bot;
}

export { initializeBot };
