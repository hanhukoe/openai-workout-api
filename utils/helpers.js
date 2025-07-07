// utils/helpers.js

import crypto from "crypto";

// Generate a UUID
export const generateId = () => crypto.randomUUID();

// Format date to YYYY-MM-DD
export const formatDate = (date) => {
  return date.toISOString().split("T")[0];
};

// Add days to a date
export const addDays = (date, numDays) => {
  const result = new Date(date);
  result.setDate(result.getDate() + numDays);
  return result;
};

// Add weeks to a date
export const addWeeks = (date, numWeeks) => {
  const result = new Date(date);
  result.setDate(result.getDate() + numWeeks * 7);
  return result;
};

// Calculate block start and end dates based on program start
export const calculateBlockDates = (startDate, weekCounts) => {
  const blocks = [];
  let current = new Date(startDate);

  for (let weeks of weekCounts) {
    const blockStart = new Date(current);
    const blockEnd = addWeeks(current, weeks);
    blocks.push({
      block_start: formatDate(blockStart),
      block_end: formatDate(addDays(blockEnd, -1))
    });
    current = blockEnd;
  }

  return blocks;
};

// Retry wrapper for async functions
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

// Enforce max length on motivational quotes
export const trimQuote = (quote, maxLength = 100) => {
  if (!quote) return "";
  return quote.length > maxLength ? quote.slice(0, maxLength - 1) + "…" : quote;
};
