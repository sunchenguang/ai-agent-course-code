function clamp(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function scoreMomentum(stockData = {}) {
  const changePercent = Number(stockData.regularMarketChangePercent);
  const price = Number(stockData.regularMarketPrice);
  const low = Number(stockData.fiftyTwoWeekLow);
  const high = Number(stockData.fiftyTwoWeekHigh);

  const changeScore = clamp(50 + changePercent * 5);
  const rangePosition =
    Number.isFinite(price) && Number.isFinite(low) && Number.isFinite(high) && high > low
      ? ((price - low) / (high - low)) * 100
      : 40;

  return clamp(changeScore * 0.55 + rangePosition * 0.45);
}

function scoreFundamentals(stockData = {}) {
  const pe = Number(stockData.trailingPE ?? stockData.forwardPE);
  if (!Number.isFinite(pe) || pe <= 0) return 45;
  if (pe <= 25) return 85;
  if (pe <= 45) return 70;
  if (pe <= 70) return 52;
  return 35;
}

function scoreSentiment(sentiment = {}) {
  const confidence = clamp(Number(sentiment.confidence ?? 0.5), 0, 1);
  const base =
    sentiment.label === "bullish"
      ? 78
      : sentiment.label === "bearish"
        ? 30
        : 55;
  return clamp(base * confidence + 50 * (1 - confidence));
}

function scoreRisk(stockData = {}, riskFlags = []) {
  let score = 90;
  const pe = Number(stockData.trailingPE ?? stockData.forwardPE);
  const changePercent = Math.abs(Number(stockData.regularMarketChangePercent));

  if (!Number.isFinite(stockData.regularMarketPrice)) score -= 35;
  if (Number.isFinite(pe) && pe > 70) score -= 18;
  if (Number.isFinite(changePercent) && changePercent > 8) score -= 10;
  score -= riskFlags.length * 8;

  return clamp(score);
}

function ratingFor(score) {
  if (score >= 75) return "强烈关注";
  if (score >= 65) return "关注";
  if (score >= 50) return "谨慎关注";
  return "暂不推荐";
}

export function scoreCandidates(candidates) {
  return candidates
    .map((candidate) => {
      const stockData = candidate.stockData ?? {};
      const riskFlags = [...(candidate.riskFlags ?? [])];
      if (!Number.isFinite(Number(stockData.regularMarketPrice))) {
        riskFlags.push("行情数据不完整");
      }

      const factors = {
        momentum: Math.round(scoreMomentum(stockData)),
        fundamentals: Math.round(scoreFundamentals(stockData)),
        sentiment: Math.round(scoreSentiment(candidate.sentiment)),
        riskControl: Math.round(scoreRisk(stockData, riskFlags)),
      };

      const score = Math.round(
        factors.momentum * 0.3 +
          factors.fundamentals * 0.2 +
          factors.sentiment * 0.3 +
          factors.riskControl * 0.2,
      );

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
