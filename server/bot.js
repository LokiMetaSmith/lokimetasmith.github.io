import { Telegraf } from 'telegraf';

let bot;

/**
 * Initializes and returns a Telegraf bot instance.
 * @param {string} token - The Telegram Bot API token.
 * @returns {Telegraf | undefined} The bot instance or undefined if no token is provided.
 */
function initializeBot(token) {
  if (token) {
    bot = new Telegraf(token);
    bot.launch();
    console.log('[BOT] Telegraf bot launched.');

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  }
  return bot;
}

export { initializeBot };
