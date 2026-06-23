import { getStockSnapshot } from "../tools/yahoo-finance.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchStockDataNode(state) {
  const stocks = [];
  for (const ticker of state.tickers) {
    stocks.push(await getStockSnapshot(ticker));
    await sleep(300);
  }

  const errors = [
    ...(state.errors ?? []),
    ...stocks
      .filter((stock) => stock.error)
      .map((stock) => `${stock.ticker}: 行情获取失败 - ${stock.error}`),
  ];

  return { stocks, errors };
}
