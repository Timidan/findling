export class PriceInputError extends Error {
  constructor(readonly reason = "invalid_price") {
    super(reason);
    this.name = "PriceInputError";
  }
}

export interface PriceParseOptions {
  defaultMicroUsdc: number;
  minMicroUsdc: number;
  maxMicroUsdc: number;
}

const DECIMAL_USD = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/;
const MICRO_USDC_SCALE = BigInt(1_000_000);

export function parsePriceMicroUsdcInput(
  input: { priceMicroUsdc?: unknown; priceUsd?: unknown },
  options: PriceParseOptions,
): number {
  const hasMicro = input.priceMicroUsdc !== undefined;
  const hasUsd = input.priceUsd !== undefined;
  if (!hasMicro && !hasUsd) return assertEnvelope(options.defaultMicroUsdc, options);
  if (hasMicro) return parseMicroUsdc(input.priceMicroUsdc, options);
  return parseDecimalUsd(input.priceUsd, options);
}

function parseMicroUsdc(value: unknown, options: PriceParseOptions): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new PriceInputError();
  }
  return assertEnvelope(value, options);
}

function parseDecimalUsd(value: unknown, options: PriceParseOptions): number {
  if (typeof value !== "string") throw new PriceInputError();
  const trimmed = value.trim();
  const match = DECIMAL_USD.exec(trimmed);
  if (!match) throw new PriceInputError();

  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] ?? "").padEnd(6, "0"));
  const micro = whole * MICRO_USDC_SCALE + fractional;
  if (micro > BigInt(Number.MAX_SAFE_INTEGER)) throw new PriceInputError();
  return assertEnvelope(Number(micro), options);
}

function assertEnvelope(value: number, options: PriceParseOptions): number {
  if (
    !Number.isSafeInteger(value) ||
    value < options.minMicroUsdc ||
    value > options.maxMicroUsdc
  ) {
    throw new PriceInputError();
  }
  return value;
}
