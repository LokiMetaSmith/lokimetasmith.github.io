import { jest } from '@jest/globals';

// A mock that correctly exports a Telegraf class with a dummy telegram object
export class Telegraf {
  constructor(token) {
    this.token = token;
  }

  telegram = {
    sendMessage: jest.fn(),
    sendPhoto: jest.fn(),
    sendDocument: jest.fn(),
    editMessageText: jest.fn(),
    deleteMessage: jest.fn(),
  };

  launch = jest.fn();
  stop = jest.fn();
}
