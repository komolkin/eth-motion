"use client";
import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";

export default function Home() {
  const [ethPrice, setEthPrice] = useState<number | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        const data = await res.json();
        setEthPrice(data.ethereum.usd);
      } catch (e) {
        // handle error
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      {ethPrice !== null ? (
        <div className="eth-price font-bold text-center">
          ETH: <NumberFlow value={ethPrice} format={{ style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 2 }} />
        </div>
      ) : (
        <div className="text-2xl">Loading...</div>
      )}
    </div>
  );
}
