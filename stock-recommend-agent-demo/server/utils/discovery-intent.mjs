import { extractTickersFromText } from "./company-ticker.mjs";

const DISCOVERY_PATTERN =
  /(?:值得关注|热点|热门|方向|领域|板块|行业|概念|赛道|风口|有哪些.*(?:看|推荐|关注)|帮我找|帮我发现|最近.*(?:什么|哪些)|什么.*(?:板块|行业|方向|领域)|推荐.*(?:板块|行业|方向|领域))/u;

const FUND_PATTERN =
  /(?:基金|ETF|etf|公募|指数基金|宽基|行业基金|主题基金|收益优先|基金排名|基金推荐|基金排行)/u;

const EXPLICIT_RESEARCH_WITH_TICKERS =
  /(?:研究|调研|分析|对比).*(?:NVDA|AMD|\d{6}|\.SS|\.SZ)/iu;

export function hasDiscoveryIntent(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  if (FUND_PATTERN.test(raw)) return true;
  if (!DISCOVERY_PATTERN.test(raw)) return false;

  const tickers = extractTickersFromText(raw);
  if (tickers.length >= 2) return false;
  if (tickers.length === 1 && EXPLICIT_RESEARCH_WITH_TICKERS.test(raw)) return false;

  return true;
}

export function detectDiscoveryRequest(text) {
  const raw = String(text ?? "").trim();
  if (FUND_PATTERN.test(raw)) {
    return {
      isDiscovery: false,
      isFundRequest: true,
      query: raw,
      options: {
        boardTypes: ["industry", "concept"],
        topSectors: 3,
        stocksPerSector: 2,
        maxTickers: 5,
      },
    };
  }

  const wantsConcept = /概念/u.test(raw);
  const wantsIndustry = /行业/u.test(raw);
  const boardTypes =
    wantsConcept && !wantsIndustry
      ? ["concept"]
      : wantsIndustry && !wantsConcept
        ? ["industry"]
        : ["industry", "concept"];

  return {
    isDiscovery: hasDiscoveryIntent(raw),
    query: raw,
    options: {
      boardTypes,
      topSectors: 3,
      stocksPerSector: 2,
      maxTickers: 5,
    },
  };
}
