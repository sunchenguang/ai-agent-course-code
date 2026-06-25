import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "未知";
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formatPrice(value, currency) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "未知";
  return `${number.toFixed(2)} ${currency ?? "USD"}`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "未知";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number);
}

function formatConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "未知";
  return `${Math.round(number * 100)}%`;
}

function formatSentimentLabel(label) {
  return (
    {
      bullish: "偏多",
      neutral: "中性",
      bearish: "偏空",
    }[label] ?? "未知"
  );
}

function factorLabel(key) {
  return {
    momentum: "动量",
    fundamentals: "基本面",
    sentiment: "情绪",
    riskControl: "风控",
  }[key] ?? key;
}

function getYahooFinanceUrl(ticker) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`;
}

function getEastMoneyQuoteUrl(ticker) {
  const raw = String(ticker ?? "").trim().toUpperCase();
  const suffixMatch = raw.match(/^(.+)\.(SS|SZ|SH|HK)$/);
  if (suffixMatch) {
    const code = suffixMatch[1].replace(/\D/g, "");
    const suffix = suffixMatch[2];
    if (suffix === "HK") {
      return `https://quote.eastmoney.com/hk/${code.padStart(5, "0")}.html`;
    }
    if (suffix === "SS" || suffix === "SH") {
      return `https://quote.eastmoney.com/sh${code.padStart(6, "0")}.html`;
    }
    if (suffix === "SZ") {
      return `https://quote.eastmoney.com/sz${code.padStart(6, "0")}.html`;
    }
  }

  const digitsOnly = raw.replace(/\D/g, "");
  if (/^\d{6}$/.test(digitsOnly)) {
    if (digitsOnly.startsWith("6")) {
      return `https://quote.eastmoney.com/sh${digitsOnly}.html`;
    }
    if (digitsOnly.startsWith("0") || digitsOnly.startsWith("3")) {
      return `https://quote.eastmoney.com/sz${digitsOnly}.html`;
    }
  }

  if (/^\d{4,5}$/.test(digitsOnly)) {
    return `https://quote.eastmoney.com/hk/${digitsOnly.padStart(5, "0")}.html`;
  }

  return null;
}

function getStockQuoteSourceUrl(ticker, sourceName) {
  const eastMoneyUrl = getEastMoneyQuoteUrl(ticker);
  if (eastMoneyUrl) return eastMoneyUrl;
  if (String(sourceName ?? "").includes("东方财富")) {
    return "https://quote.eastmoney.com/";
  }
  return getYahooFinanceUrl(ticker);
}

const markdownRenderer = new marked.Renderer();
markdownRenderer.link = ({ href, title, text }) => {
  const titleAttr = title ? ` title="${title}"` : "";
  return `<a href="${href}"${titleAttr} target="_blank" rel="noreferrer">${text}</a>`;
};

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer: markdownRenderer,
});

export function MarkdownPreview({ markdown, className = "" }) {
  const html = useMemo(() => {
    const source = String(markdown ?? "").trim();
    if (!source) return "";
    return marked.parse(source, { async: false });
  }, [markdown]);

  if (!html) return null;

  return (
    <div
      className={className ? `markdown ${className}` : "markdown"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function SourceModal({ item, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const stockData = item.stockData ?? {};
  const displayName = item.name ?? stockData.shortName ?? item.ticker;
  const currency = stockData.currency ?? "USD";
  const stockFields = [
    ["当前价格", formatPrice(stockData.regularMarketPrice, currency)],
    ["涨跌幅", formatPercent(stockData.regularMarketChangePercent)],
    ["52 周低点", formatPrice(stockData.fiftyTwoWeekLow, currency)],
    ["52 周高点", formatPrice(stockData.fiftyTwoWeekHigh, currency)],
    ["市盈率", formatNumber(stockData.trailingPE ?? stockData.forwardPE)],
    ["成交量", formatNumber(stockData.regularMarketVolume)],
  ];
  const visibleStockFields = stockFields.filter(([, value]) => value !== "未知");
  const hasQuoteData = visibleStockFields.length > 0;
  const newsItems = item.news?.items ?? [];
  const riskFlags = item.riskFlags?.length ? item.riskFlags : ["未发现明显风险信号"];
  const stockSourceName = stockData.source ?? "Yahoo Finance";
  const stockSourceUrl = getStockQuoteSourceUrl(item.ticker, stockSourceName);

  return (
    <div className="source-modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label={`${item.ticker} 信息源`}
        aria-modal="true"
        className="source-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="source-modal-head">
          <div>
            <p className="eyebrow">Source Details</p>
            <h2>
              {displayName}
              <span>{item.ticker}</span>
            </h2>
          </div>
          <button aria-label="关闭信息源弹窗" className="modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="source-summary">
          <div>
            <span>推荐分</span>
            <strong>{item.score}</strong>
          </div>
          <div>
            <span>评级</span>
            <strong>{item.rating}</strong>
          </div>
          <div>
            <span>情绪</span>
            <strong>{formatSentimentLabel(item.sentiment?.label)}</strong>
          </div>
          <div>
            <span>置信度</span>
            <strong>{formatConfidence(item.sentiment?.confidence)}</strong>
          </div>
        </div>

        <div className="source-sections">
          <section>
            <div className="source-section-head">
              <h3>行情数据</h3>
              <a href={stockSourceUrl} rel="noreferrer" target="_blank">
                来源：{stockSourceName}
              </a>
            </div>
            {hasQuoteData ? (
              <dl className="source-fields">
                {visibleStockFields.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="empty-source">
                暂无可展示行情字段，当前数据源可能只返回了基础元信息，已尝试自动回退到可用行情源。
              </p>
            )}
          </section>

          <section>
            <h3>分析依据</h3>
            <p className="source-reason">{item.sentiment?.reason ?? "暂无新闻情绪解释"}</p>
            <div className="risks source-risks">
              {riskFlags.map((risk) => (
                <span key={risk}>{risk}</span>
              ))}
            </div>
          </section>

          {newsItems.length ? (
            <section className="news-source-section">
              <h3>近期新闻</h3>
              <div className="news-list">
                {newsItems.map((news, index) => (
                  <article className="news-item" key={`${news.url}-${index}`}>
                    <a href={news.url} rel="noreferrer" target="_blank">
                      {news.title || "未命名新闻"}
                    </a>
                    <p>{news.summary || "暂无摘要"}</p>
                    <span>
                      {[news.siteName, news.publishedAt].filter(Boolean).join(" · ") || "来源未知"}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function RankingCard({ item, index, onOpen }) {
  const displayName = item.name ?? item.stockData?.shortName ?? item.ticker;

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(item);
    }
  }

  return (
    <article
      aria-label={`查看 ${displayName} 信息源`}
      className="ranking-card"
      onClick={() => onOpen(item)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="rank-badge">Top {index + 1}</div>
      <div className="card-head">
        <div>
          <h3>{displayName}</h3>
          <p>{item.ticker}</p>
        </div>
        <div className="score">
          <strong>{item.score}</strong>
          <span>{item.rating}</span>
        </div>
      </div>

      <div className="market-row">
        <span>价格 {formatPrice(item.stockData?.regularMarketPrice, item.stockData?.currency)}</span>
        <span>涨跌 {formatPercent(item.stockData?.regularMarketChangePercent)}</span>
      </div>

      <p className="sentiment">{item.sentiment?.reason ?? "暂无新闻情绪解释"}</p>

      <div className="factors">
        {Object.entries(item.factors ?? {}).map(([key, value]) => (
          <div key={key}>
            <span>{factorLabel(key)}</span>
            <meter max="100" min="0" value={value} />
            <b>{value}</b>
          </div>
        ))}
      </div>

      <div className="risks">
        {(item.riskFlags?.length ? item.riskFlags : ["未发现明显风险信号"]).map((risk) => (
          <span key={risk}>{risk}</span>
        ))}
      </div>
    </article>
  );
}

export function RankingSection({ theme, tickers, ranking, errors }) {
  const [selectedSourceItem, setSelectedSourceItem] = useState(null);

  if (!ranking?.length) return null;

  return (
    <>
      <section className="section-head">
        <div>
          <p className="eyebrow">Recommendation Ranking</p>
          <h2>{theme} 推荐榜单</h2>
        </div>
        <span>{tickers?.join(" / ")}</span>
      </section>

      <section className="ranking-grid">
        {ranking.map((item, index) => (
          <RankingCard index={index} item={item} key={item.ticker} onOpen={setSelectedSourceItem} />
        ))}
      </section>

      {errors?.length ? (
        <section className="warnings">
          <h2>数据缺口</h2>
          {errors.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </section>
      ) : null}

      {selectedSourceItem ? (
        <SourceModal item={selectedSourceItem} onClose={() => setSelectedSourceItem(null)} />
      ) : null}
    </>
  );
}
