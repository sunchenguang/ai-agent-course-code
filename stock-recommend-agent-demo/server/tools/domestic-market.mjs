import {
  parseMarketTicker,
  toDisplayTicker,
  toEastMoneySecId,
} from "../utils/market-ticker.mjs";

const QUOTE_URL = "https://push2.eastmoney.com/api/qt/stock/get";
const QUOTE_FIELDS = "f43,f58,f60,f116,f162,f170";

function pickNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function exchangeLabel(parsed) {
  if (parsed.exchange === "SSE") return "上海证券交易所";
  if (parsed.exchange === "SZSE") return "深圳证券交易所";
  return "香港交易所";
}

function currencyFor(parsed) {
  return parsed.market === "cn-hk" ? "HKD" : "CNY";
}

export async function getDomesticStockSnapshot(ticker) {
  const parsed = parseMarketTicker(ticker);
  const displayTicker = toDisplayTicker(parsed);

  if (parsed.market !== "cn-a" && parsed.market !== "cn-hk") {
    return {
      ticker: displayTicker || String(ticker ?? ""),
      shortName: displayTicker || String(ticker ?? ""),
      error: "非 A 股/港股代码",
      source: "东方财富",
    };
  }

  try {
    const url = new URL(QUOTE_URL);
    url.searchParams.set("secid", toEastMoneySecId(parsed));
    url.searchParams.set("fields", QUOTE_FIELDS);
    url.searchParams.set("fltt", "2");
    url.searchParams.set("invt", "2");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Referer: "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Error(`东方财富 API 失败: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.rc !== 0 || !json.data) {
      throw new Error("东方财富 API 返回空数据");
    }

    const data = json.data;
    const price = pickNumber(data.f43);
    const marketCap = pickNumber(data.f116);

    if (price == null && marketCap == null) {
      throw new Error("未找到该代码行情");
    }

    return {
      ticker: displayTicker,
      shortName: data.f58 ?? displayTicker,
      currency: currencyFor(parsed),
      exchange: exchangeLabel(parsed),
      regularMarketPrice: price,
      regularMarketChangePercent: pickNumber(data.f170),
      regularMarketPreviousClose: pickNumber(data.f60),
      marketCap,
      trailingPE: pickNumber(data.f162),
      forwardPE: null,
      fiftyTwoWeekLow: null,
      fiftyTwoWeekHigh: null,
      averageAnalystRating: "",
      source: "东方财富",
    };
  } catch (error) {
    return {
      ticker: displayTicker,
      shortName: displayTicker,
      error: error instanceof Error ? error.message : String(error),
      source: "东方财富",
    };
  }
}
