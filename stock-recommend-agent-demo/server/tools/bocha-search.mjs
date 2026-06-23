const BOCHA_API_URL = "https://api.bochaai.com/v1/web-search";

function toNewsItems(webpages = []) {
  return webpages.map((page) => ({
    title: page.name ?? "",
    url: page.url ?? "",
    summary: page.summary ?? "",
    siteName: page.siteName ?? "",
    publishedAt: page.dateLastCrawled ?? "",
  }));
}

export async function bochaWebSearch({
  query,
  count = 5,
  freshness = "oneWeek",
  summary = true,
} = {}) {
  const apiKey = process.env.BOCHA_API_KEY?.trim();
  const normalizedQuery = String(query ?? "").trim();

  if (!normalizedQuery) {
    return { query: normalizedQuery, items: [], warning: "搜索关键词为空" };
  }

  if (!apiKey) {
    return {
      query: normalizedQuery,
      items: [],
      warning: "未配置 BOCHA_API_KEY，跳过联网搜索",
    };
  }

  try {
    const response = await fetch(BOCHA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: normalizedQuery,
        freshness,
        summary,
        count,
      }),
    });

    if (!response.ok) {
      return {
        query: normalizedQuery,
        items: [],
        warning: `Bocha 搜索失败：HTTP ${response.status}`,
      };
    }

    const json = await response.json();
    if (json.code !== 200 || !json.data) {
      return {
        query: normalizedQuery,
        items: [],
        warning: `Bocha 搜索失败：${json.msg ?? "未知错误"}`,
      };
    }

    return {
      query: normalizedQuery,
      items: toNewsItems(json.data.webPages?.value ?? []),
    };
  } catch (error) {
    return {
      query: normalizedQuery,
      items: [],
      warning: `Bocha 搜索异常：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildNewsQuery({ ticker, companyName, theme }) {
  const parts = [ticker];
  const name = companyName?.trim();
  if (name && name.toUpperCase() !== ticker.toUpperCase()) {
    parts.push(name);
  }
  parts.push("stock", "latest", "news");
  if (theme?.trim()) {
    parts.push(theme.trim());
  }
  return parts.join(" ");
}

export async function searchStockNews({ ticker, companyName, theme, count = 5 }) {
  const query = buildNewsQuery({ ticker, companyName, theme });
  const result = await bochaWebSearch({ query, count, freshness: "oneWeek" });
  return {
    ticker,
    query,
    items: result.items,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

export function buildTickerResolveQuery(companyName) {
  const name = String(companyName ?? "").trim();
  if (/[\u4e00-\u9fff]/.test(name)) {
    return `${name} 股票代码 A股 港股 上市`;
  }
  return `${name} stock ticker symbol IPO listed NASDAQ NYSE`;
}

export async function searchCompanyTickerCandidates(companyName, { count = 8 } = {}) {
  const query = buildTickerResolveQuery(companyName);
  const result = await bochaWebSearch({
    query,
    count,
    freshness: "oneMonth",
  });
  return {
    companyName,
    query,
    items: result.items,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}
