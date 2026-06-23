import { searchStockNews } from "../tools/bocha-search.mjs";

export async function searchNewsNode(state) {
  const stocks = state.stocks?.length
    ? state.stocks
    : (state.tickers ?? []).map((ticker) => ({ ticker, shortName: ticker }));

  const newsResults = await Promise.all(
    stocks.map((stock) =>
      searchStockNews({
        ticker: stock.ticker,
        companyName: stock.shortName,
        theme: state.theme,
        count: 5,
      }),
    ),
  );

  return { newsResults };
}

export async function buildCandidatesNode(state) {
  const newsByTicker = new Map((state.newsResults ?? []).map((result) => [result.ticker, result]));
  const candidates = state.stocks.map((stock) => {
    const news = newsByTicker.get(stock.ticker) ?? { items: [] };
    return {
      ticker: stock.ticker,
      name: stock.shortName,
      stockData: stock,
      news,
      riskFlags: [
        ...(stock.error ? ["行情获取失败"] : []),
        ...(news.warning ? [news.warning] : []),
        ...(news.items?.length ? [] : ["近期新闻不足"]),
      ],
    };
  });

  const errors = [
    ...(state.errors ?? []),
    ...(state.newsResults ?? [])
      .filter((result) => result.warning)
      .map((result) => `${result.ticker}: ${result.warning}`),
  ];

  return { candidates, errors };
}
