export function parseMarketTicker(ticker) {
  const raw = String(ticker ?? "").trim().toUpperCase();
  if (!raw) {
    return { market: "other", raw: "", displayTicker: "" };
  }

  const suffixMatch = raw.match(/^(.+)\.(SS|SZ|SH|HK)$/);
  if (suffixMatch) {
    const code = suffixMatch[1].replace(/\D/g, "");
    const suffix = suffixMatch[2];

    if (suffix === "HK") {
      const normalized = code.padStart(4, "0");
      return {
        market: "cn-hk",
        exchange: "HKEX",
        code: normalized,
        raw,
        displayTicker: `${normalized}.HK`,
      };
    }

    if (suffix === "SS" || suffix === "SH") {
      const normalized = code.padStart(6, "0");
      return {
        market: "cn-a",
        exchange: "SSE",
        code: normalized,
        raw,
        displayTicker: `${normalized}.SS`,
      };
    }

    if (suffix === "SZ") {
      const normalized = code.padStart(6, "0");
      return {
        market: "cn-a",
        exchange: "SZSE",
        code: normalized,
        raw,
        displayTicker: `${normalized}.SZ`,
      };
    }
  }

  const digitsOnly = raw.replace(/\D/g, "");
  if (/^\d{6}$/.test(digitsOnly)) {
    if (digitsOnly.startsWith("6")) {
      return {
        market: "cn-a",
        exchange: "SSE",
        code: digitsOnly,
        raw,
        displayTicker: `${digitsOnly}.SS`,
      };
    }
    if (digitsOnly.startsWith("0") || digitsOnly.startsWith("3")) {
      return {
        market: "cn-a",
        exchange: "SZSE",
        code: digitsOnly,
        raw,
        displayTicker: `${digitsOnly}.SZ`,
      };
    }
  }

  if (/^\d{4,5}$/.test(digitsOnly)) {
    const normalized = digitsOnly.padStart(4, "0");
    return {
      market: "cn-hk",
      exchange: "HKEX",
      code: normalized,
      raw,
      displayTicker: `${normalized}.HK`,
    };
  }

  return { market: "other", raw, displayTicker: raw };
}

export function isDomesticMarket(ticker) {
  const { market } = parseMarketTicker(ticker);
  return market === "cn-a" || market === "cn-hk";
}

export function toEastMoneySecId(parsed) {
  if (parsed.market === "cn-a") {
    const prefix = parsed.exchange === "SSE" ? "1" : "0";
    return `${prefix}.${parsed.code}`;
  }

  if (parsed.market === "cn-hk") {
    return `116.${parsed.code.padStart(5, "0")}`;
  }

  throw new Error(`无法生成东方财富 secid: ${parsed.raw}`);
}

export function toDisplayTicker(parsed) {
  return parsed.displayTicker || parsed.raw;
}
