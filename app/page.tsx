"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import NumberFlow from "@number-flow/react";
import { Liveline } from "liveline";
import type { LivelinePoint } from "liveline";

const COINS = [
  { id: "ethereum", label: "Ethereum", color: "#627eea" },
  { id: "bitcoin", label: "Bitcoin", color: "#f7931a" },
  { id: "solana", label: "Solana", color: "#9945ff" },
  { id: "rarible", label: "Rarible", color: "#feda03" },
  { id: "arbitrum", label: "Arbitrum", color: "#28a0f0" },
];

export default function Home() {
  const [selectedCoin, setSelectedCoin] = useState(COINS[0].id);
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [showDecimals, setShowDecimals] = useState(false);
  const [chartData, setChartData] = useState<LivelinePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const latestPrice = useRef<number>(0);

  const coinColor = COINS.find((c) => c.id === selectedCoin)?.color ?? "#3b82f6";

  useEffect(() => {
    setChartData([]);
    setPrice(null);
    setChange(null);
    setLoading(true);
  }, [selectedCoin]);

  const handleFetch = useCallback(async () => {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${selectedCoin}&vs_currencies=usd&include_24hr_change=true`
      );
      const data = await res.json();
      const usd: number | undefined = data[selectedCoin]?.usd;
      const usdChange: number | undefined = data[selectedCoin]?.usd_24h_change;

      if (usd != null) {
        setPrice(usd);
        latestPrice.current = usd;
        setChartData((prev) => [
          ...prev,
          { time: Date.now() / 1000, value: usd },
        ]);
        setLoading(false);
      }
      if (usdChange != null) setChange(usdChange);
    } catch {
      // network error — keep previous data
    }
  }, [selectedCoin]);

  useEffect(() => {
    handleFetch();
    const interval = setInterval(handleFetch, 2000);
    return () => clearInterval(interval);
  }, [handleFetch]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 gap-6">
      <select
        value={selectedCoin}
        onChange={(e) => setSelectedCoin(e.target.value)}
      >
        {COINS.map((coin) => (
          <option key={coin.id} value={coin.id}>
            {coin.label}
          </option>
        ))}
      </select>

      <div
        className="eth-price font-bold text-center cursor-pointer select-none"
        title="Click to toggle decimals"
        onClick={() => setShowDecimals((v) => !v)}
      >
        {price !== null ? (
          <>
            <NumberFlow
              value={price}
              format={{
                style: "currency",
                currency: "USD",
                currencyDisplay: "narrowSymbol",
                maximumFractionDigits: showDecimals ? 2 : 0,
                minimumFractionDigits: showDecimals ? 2 : 0,
              }}
            />
            {change !== null && (
              <div
                className={`eth-change font-mono ${change >= 0 ? "text-green-500" : "text-red-500"}`}
              >
                <NumberFlow
                  value={change / 100}
                  format={{
                    signDisplay: "always",
                    style: "percent",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }}
                />
                {price !== null && (
                  <span className="ml-2 eth-change">
                    (
                    <NumberFlow
                      value={price * (change / 100)}
                      format={{
                        signDisplay: "always",
                        style: "currency",
                        currency: "USD",
                        currencyDisplay: "narrowSymbol",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }}
                    />
                    )
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-2xl">Loading...</div>
        )}
      </div>

      <div className="w-full max-w-3xl" style={{ height: 300 }}>
        <Liveline
          data={chartData}
          value={latestPrice.current}
          color={coinColor}
          theme="dark"
          loading={loading}
          exaggerate
          grid
          badge
          pulse
          scrub
          momentum
          formatValue={(v) =>
            `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          }
          windows={[
            { label: "30s", secs: 30 },
            { label: "1m", secs: 60 },
            { label: "2m", secs: 120 },
            { label: "5m", secs: 300 },
          ]}
        />
      </div>
    </div>
  );
}
