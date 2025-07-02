"use client";
import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";

export default function Home() {
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [ethChange, setEthChange] = useState<number | null>(null);
  const [showDecimals, setShowDecimals] = useState(false);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true"
        );
        const data = await res.json();
        setEthPrice(data.ethereum.usd);
        setEthChange(data.ethereum.usd_24h_change);
      } catch (e) {
        // handle error
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div
        className="eth-price font-bold text-center cursor-pointer select-none"
        title="Click to toggle decimals"
        onClick={() => setShowDecimals((v) => !v)}
      >
        {ethPrice !== null ? (
          <div className="eth-price font-bold text-center">
            <NumberFlow value={ethPrice} format={{ style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: showDecimals ? 2 : 0, minimumFractionDigits: showDecimals ? 2 : 0 }} />
            {ethChange !== null && (
              <div
                className={`text-4xl mt-4 font-mono ${ethChange >= 0 ? "text-green-500" : "text-red-500"}`}
              >
                <NumberFlow value={ethChange / 100} format={{ signDisplay: "always", style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
                {ethPrice !== null && (
                  <span className="ml-2 text-3xl">
                    (
                    <NumberFlow
                      value={ethPrice * (ethChange / 100)}
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
          </div>
        ) : (
          <div className="text-2xl">Loading...</div>
        )}
      </div>
    </div>
  );
}
