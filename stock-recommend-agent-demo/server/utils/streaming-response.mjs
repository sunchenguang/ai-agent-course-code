export function encodeSseEvent(event, payload) {
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  const dataLines = String(data).split(/\r?\n/).map((line) => `data: ${line}`);
  return [`event: ${event}`, ...dataLines, "", ""].join("\n");
}

export function writeSseEvent(res, event, payload) {
  res.write(encodeSseEvent(event, payload));
  if (typeof res.flush === "function") {
    res.flush();
  }
}
