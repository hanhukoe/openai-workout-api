// /utils/helpers.js
import crypto from "crypto";

export const generateId = () => crypto.randomUUID();

export const formatDate = (date) => new Date(date).toISOString().split("T")[0];

export const addDays = (date, numDays) => {
  const result = new Date(date);
  result.setDate(result.getDate() + numDays);
  return result;
};

export const addWeeks = (date, numWeeks) => addDays(date, numWeeks * 7);

export const retry = async (fn, maxRetries = 2, delayMs = 1000) => {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
};

export const trimQuote = (quote, maxLength = 100) => {
  if (!quote) return "";
  return quote.length > maxLength ? quote.slice(0, maxLength - 1) + "…" : quote;
};
