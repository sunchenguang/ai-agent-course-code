function clamp(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeCode(code) {
  return String(code ?? "").trim().toUpperCase();
}

function isEtfLike(code, name = "") {
  const raw = `${code} ${name}`.toUpperCase();
  return /ETF|ETF基金|交易型开放式指数基金|联接基金/.test(raw) || /^(?:1|5)\d{5}$/.test(normalizeCode(code));
}

function scoreReturn(candidate = {}) {
  const text = `${candidate.name ?? ""} ${candidate.summary ?? ""} ${candidate.quote?.shortName ?? ""}`.toUpperCase();
  const etfBoost = isEtfLike(candidate.code ?? candidate.ticker ?? "", text) ? 10 : 0;
  const nameBoost = /宽基|科技|半导体|纳指|创业|医药|黄金|红利|高股息/.test(text) ? 8 : 0;
  const change = Number(candidate.quote?.changePercent ?? candidate.quote?.regularMarketChangePercent ?? 0);
  return clamp(50 + change * 4 + etfBoost + nameBoost);
}

function scoreRisk(candidate = {}) {
  let score = 78;
  const volatility = Number(candidate.quote?.volatility ?? 0);
  const spread = Number(candidate.quote?.spreadPercent ?? 0);

  if (Number.isFinite(volatility)) score -= Math.min(20, Math.max(0, volatility * 8));
  if (Number.isFinite(spread)) score -= Math.min(12, Math.max(0, spread * 5));
  if (!candidate.quote || candidate.quote.error) score -= 20;
  if (!isEtfLike(candidate.code ?? candidate.ticker ?? "", candidate.name ?? "")) score -= 8;

  return clamp(score);
}

function ratingFor(score) {
  if (score >= 78) return "强烈关注";
  if (score >= 68) return "关注";
  if (score >= 55) return "谨慎关注";
  return "暂不推荐";
}

export function scoreFundCandidates(candidates = []) {
  return candidates
    .map((candidate) => {
      const quote = candidate.quote ?? {};
      const factors = {
        returnScore: Math.round(scoreReturn(candidate)),
        riskControl: Math.round(scoreRisk(candidate)),
        completeness: quote.error ? 35 : 80,
      };

      const score = Math.round(factors.returnScore * 0.6 + factors.riskControl * 0.25 + factors.completeness * 0.15);
      const riskFlags = [
        ...(candidate.riskFlags ?? []),
        ...(quote.error ? ["行情数据不完整"] : []),
        ...(candidate.isEtf ? [] : ["标的类型未明确识别为 ETF"]),
      ];

      return {
        ...candidate,
        factors,
        riskFlags,
        score: clamp(score),
        rating: ratingFor(score),
      };
    })
    .sort((a, b) => b.score - a.score);
}
