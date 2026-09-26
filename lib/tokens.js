// Rough token estimate (≈4 characters per token) used for the before/after comparisons.
export const estimateTokens = (text) => Math.ceil(String(text ?? "").length / 4);
