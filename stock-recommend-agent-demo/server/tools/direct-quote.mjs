import YahooFinance from "yahoo-finance2";
import { ProxyAgent } from "undici";

import { isDomesticMarket } from "../utils/market-ticker.mjs";
import { getDomesticStockSnapshot } from "./domestic-market.mjs";

const yahooFinance = new YahooFinance();
const yahooFinanceProxy = process.env.YAHOO_FINANCE_PROXY?.trim();
const dispatcher = yahooFinanceProxy ? new ProxyAgent(yahooFinanceProxy) : undefined;

if (yahooFinanceProxy) {
  const originalFetch = yahooFinance._env.fetch;
  yahooFinance._env.fetch = (input, init = {}) =>
    originalFetch(input, {
      ...init,
      dispatcher,
    });
}

function pickNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function changePercent(price, previousClose) {
  const p = Number(price);
  const prev = Number(previousClose);
  if (!Number.isFinite(p) || !Number.isFinite(prev) || prev === 0) return null;
  return ((p - prev) / prev) * 100;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getChartSnapshot(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker,
  )}?range=1d&interval=1d`;
  let response;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(url, {
        ...(dispatcher ? { dispatcher } : {}),
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
      });
      break;
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }

  if (!response) {
    throw lastError ?? new Error("Yahoo chart API request failed");
  }

  if (!response.ok) {
    throw new Error(`Yahoo chart API failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const result = json.chart?.result?.[0];
  const error = json.chart?.error;
  if (!result || error) {
    throw new Error(error?.description ?? "Yahoo chart API returned empty result");
  }

  const meta = result.meta ?? {};
  const price = pickNumber(meta.regularMarketPrice);
  const previousClose = pickNumber(meta.chartPreviousClose ?? meta.previousClose);

  return {
    ticker,
    shortName: meta.shortName ?? meta.longName ?? ticker,
    currency: meta.currency ?? "USD",
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? "",
    regularMarketPrice: price,
    regularMarketChangePercent: changePercent(price, previousClose),
    regularMarketPreviousClose: previousClose,
    marketCap: pickNumber(meta.marketCap),
    trailingPE: null,
    forwardPE: null,
    fiftyTwoWeekLow: pickNumber(meta.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: pickNumber(meta.fiftyTwoWeekHigh),
    averageAnalystRating: "",
    source: "Yahoo Finance Chart API",
  };
}

/** 直连行情：东方财富(A/HK) + Yahoo(其他)，不经 MCP */
export async function getDirectStockSnapshot(ticker) {
  if (isDomesticMarket(ticker)) {
    return getDomesticStockSnapshot(ticker);
  }

  try {
    return await getChartSnapshot(ticker);
  } catch (chartError) {
    try {
      const quote = await yahooFinance.quote(ticker);
      return {
        ticker,
        shortName: quote.shortName ?? quote.longName ?? ticker,
        currency: quote.currency ?? "USD",
        exchange: quote.fullExchangeName ?? quote.exchange ?? "",
        regularMarketPrice: pickNumber(quote.regularMarketPrice),
        regularMarketChangePercent: pickNumber(quote.regularMarketChangePercent),
        regularMarketPreviousClose: pickNumber(quote.regularMarketPreviousClose),
        marketCap: pickNumber(quote.marketCap),
        trailingPE: pickNumber(quote.trailingPE),
        forwardPE: pickNumber(quote.forwardPE),
        fiftyTwoWeekLow: pickNumber(quote.fiftyTwoWeekLow),
        fiftyTwoWeekHigh: pickNumber(quote.fiftyTwoWeekHigh),
        averageAnalystRating: quote.averageAnalystRating ?? "",
        source: "Yahoo Finance",
      };
    } catch (error) {
      return {
        ticker,
        shortName: ticker,
        error: `Chart API: ${
          chartError instanceof Error ? chartError.message : String(chartError)
        }; Quote API: ${error instanceof Error ? error.message : String(error)}`,
        source: "Yahoo Finance",
      };
    }
  }
}
