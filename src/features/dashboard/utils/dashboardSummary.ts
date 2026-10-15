export interface DashboardHolding {
  assetId: string;
  ticker: string;
  name: string;
  quantity: number;
  averageBuyPrice: number;
  currentPrice: number;
  quotedAt: string | null;
  isSimulated: boolean;
}

export interface ValuedHolding extends DashboardHolding {
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  percentage: number;
}

export interface DashboardSummary {
  cashBalance: number;
  investedValue: number;
  netWorth: number;
  liquidityPercentage: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPercentage: number | null;
  holdings: ValuedHolding[];
  hasStaleQuotes: boolean;
  hasSimulatedQuotes: boolean;
}

export function buildDashboardSummary(cashBalance: number, holdings: DashboardHolding[], now = Date.now()): DashboardSummary {
  if (!Number.isFinite(cashBalance) || cashBalance < 0) {
    throw new Error('No se puede calcular el patrimonio con el saldo disponible.');
  }
  const valuedHoldings = holdings.map((holding) => {
    if (![holding.quantity, holding.averageBuyPrice, holding.currentPrice]
      .every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error(`No hay una valoración válida para ${holding.ticker}.`);
    }
    const marketValue = holding.quantity * holding.currentPrice;
    const costBasis = holding.quantity * holding.averageBuyPrice;
    return { ...holding, marketValue, costBasis, unrealizedPnl: marketValue - costBasis };
  });
  // Conservar la precisión hasta presentar los importes.
  const investedValue = valuedHoldings.reduce((total, item) => total + item.marketValue, 0);
  const costBasis = valuedHoldings.reduce((total, item) => total + item.costBasis, 0);
  const netWorth = cashBalance + investedValue;
  const unrealizedPnl = investedValue - costBasis;
  return {
    cashBalance, investedValue, netWorth, costBasis, unrealizedPnl,
    liquidityPercentage: netWorth > 0 ? cashBalance / netWorth * 100 : 100,
    unrealizedPnlPercentage: costBasis > 0 ? unrealizedPnl / costBasis * 100 : null,
    holdings: valuedHoldings.map((item) => ({
      ...item, percentage: netWorth > 0 ? item.marketValue / netWorth * 100 : 0,
    })).sort((a, b) => b.marketValue - a.marketValue),
    hasStaleQuotes: holdings.some(({ quotedAt }) => {
      const timestamp = quotedAt ? Date.parse(quotedAt) : Number.NaN;
      return !Number.isFinite(timestamp) || now - timestamp > 120_000 || timestamp - now > 5_000;
    }),
    hasSimulatedQuotes: holdings.some((item) => item.isSimulated),
  };
}
