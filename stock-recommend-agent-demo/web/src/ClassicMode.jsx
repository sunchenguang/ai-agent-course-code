import { useState } from "react";

import { requestRecommendationStream } from "./api.js";
import { MarkdownPreview, RankingSection } from "./shared-ui.jsx";

const examples = [
  { label: "AI 芯片股", theme: "AI 芯片股", tickers: "NVDA, AMD, TSM, AVGO, ASML" },
  { label: "电动车股", theme: "电动车产业链", tickers: "TSLA, BYDDF, RIVN, NIO, LI" },
  { label: "科技巨头", theme: "美股科技巨头", tickers: "MSFT, AAPL, GOOGL, AMZN, META" },
];

const stepLabels = [
  { id: "normalize_input", label: "解析股票池" },
  { id: "fetch_stock_data", label: "获取行情数据" },
  { id: "search_recent_news", label: "搜索近期新闻" },
  { id: "build_candidates", label: "合并候选数据" },
  { id: "analyze_sentiment", label: "分析新闻情绪" },
  { id: "score_stocks", label: "计算推荐分" },
  { id: "generate_report", label: "生成中文研报" },
];

function ProgressSteps({ activeStep, completedSteps }) {
  return (
    <div className="steps">
      {stepLabels.map(({ id, label }, index) => (
        <div
          className={`step ${activeStep === id ? "active" : ""} ${completedSteps.includes(id) ? "completed" : ""}`}
          key={id}
        >
          <span>{index + 1}</span>
          {label}
        </div>
      ))}
    </div>
  );
}

export default function ClassicMode() {
  const [tickerText, setTickerText] = useState(examples[0].tickers);
  const [theme, setTheme] = useState(examples[0].theme);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({ activeStep: "", completedSteps: [] });
  const [error, setError] = useState("");

  async function runRecommendation(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setProgress({ activeStep: "", completedSteps: [] });
    setResult({ theme, tickers: [], ranking: [], reportMarkdown: "", errors: [] });

    try {
      await requestRecommendationStream(
        { tickerText, theme },
        {
          onProgress: ({ step, status }) => {
            setProgress((prev) => ({
              activeStep: status === "running" ? step : prev.activeStep === step ? "" : prev.activeStep,
              completedSteps:
                status === "completed" && !prev.completedSteps.includes(step)
                  ? [...prev.completedSteps, step]
                  : prev.completedSteps,
            }));
          },
          onMetadata: (data) => {
            setResult((prev) => ({ ...prev, ...data }));
          },
          onRanking: (data) => {
            setResult((prev) => ({ ...prev, ranking: data.ranking, errors: data.errors }));
          },
          onReportDelta: (chunk) => {
            setResult((prev) => ({
              ...prev,
              reportMarkdown: `${prev?.reportMarkdown ?? ""}${chunk}`,
            }));
          },
          onDone: (data) => {
            setResult(data);
          },
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="classic-panel">
        <p className="classic-note">
          经典模式：固定 6 步 LangGraph 流水线，无 Agent 规划与委派。用于与 Agent 模式对照演示。
        </p>
        <form className="form" onSubmit={runRecommendation}>
          <label>
            研究主题
            <input onChange={(event) => setTheme(event.target.value)} value={theme} />
          </label>
          <label>
            股票池，最多 5 只
            <input onChange={(event) => setTickerText(event.target.value)} value={tickerText} />
          </label>
          <div className="examples">
            {examples.map((example) => (
              <button
                key={example.label}
                onClick={() => {
                  setTheme(example.theme);
                  setTickerText(example.tickers);
                }}
                type="button"
              >
                {example.label}
              </button>
            ))}
          </div>
          <button className="primary" disabled={loading} type="submit">
            {loading ? "流水线运行中…" : "开始推荐"}
          </button>
        </form>
        <ProgressSteps activeStep={progress.activeStep} completedSteps={progress.completedSteps} />
      </section>

      {error ? <div className="error">{error}</div> : null}

      {result ? (
        <div className="classic-results">
          <RankingSection
            errors={result.errors}
            ranking={result.ranking}
            theme={result.theme}
            tickers={result.tickers}
          />
          {result.reportMarkdown ? (
            <section className="inline-report">
              <div className="report-label">投研报告</div>
              <MarkdownPreview markdown={result.reportMarkdown} />
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
