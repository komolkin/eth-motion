"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import NumberFlow from "@number-flow/react";
import { Liveline } from "liveline";
import type { LivelinePoint } from "liveline";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from "@/components/prompt-kit/prompt-input";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { Button } from "@/components/ui/button";
import { ArrowUp, Loader2 } from "lucide-react";

const BASE_RPC = "https://mainnet.base.org";
const CB_WS_URL = "wss://ws-feed.exchange.coinbase.com";
const FLUSH_INTERVAL_MS = 300;

type TokenInfo = {
  address: string;
  name: string;
  symbol: string;
  cbSymbol: string;
  color: string;
};

const POPULAR_TOKENS: TokenInfo[] = [
  {
    address: "0x4200000000000000000000000000000000000006",
    name: "Ethereum",
    symbol: "ETH",
    cbSymbol: "ETH-USD",
    color: "#627eea",
  },
  {
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    name: "Bitcoin",
    symbol: "cbBTC",
    cbSymbol: "BTC-USD",
    color: "#f7931a",
  },
  {
    address: "0x1C93569537a52c144b6B24640F72d74b5BFC1870",
    name: "Solana",
    symbol: "SOL",
    cbSymbol: "SOL-USD",
    color: "#9945ff",
  },
];

function decodeAbiString(hex: string): string {
  const data = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (data.length < 128) return "";
  const length = parseInt(data.slice(64, 128), 16);
  const strHex = data.slice(128, 128 + length * 2);
  let result = "";
  for (let i = 0; i < strHex.length; i += 2) {
    result += String.fromCharCode(parseInt(strHex.slice(i, i + 2), 16));
  }
  return result;
}

async function fetchTokenInfo(address: string): Promise<{ name: string; symbol: string } | null> {
  try {
    const [nameRes, symbolRes] = await Promise.all([
      fetch(BASE_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: address, data: "0x06fdde03" }, "latest"],
        }),
      }),
      fetch(BASE_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 2, method: "eth_call",
          params: [{ to: address, data: "0x95d89b41" }, "latest"],
        }),
      }),
    ]);

    const nameData = await nameRes.json();
    const symbolData = await symbolRes.json();

    const name = decodeAbiString(nameData.result || "");
    const symbol = decodeAbiString(symbolData.result || "");

    if (!name || !symbol) return null;
    return { name, symbol };
  } catch {
    return null;
  }
}

function getDecimalPlaces(price: number): number {
  if (price === 0) return 2;
  if (price >= 1) return 2;
  const log = Math.floor(Math.log10(Math.abs(price)));
  return Math.max(2, -log + 3);
}

function formatPrice(v: number): string {
  const decimals = getDecimalPlaces(v);
  return `$${v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

const COLORS = ["#627eea", "#f7931a", "#9945ff", "#0091ff", "#4a90d9", "#a36efd", "#ff6b35", "#00d2ff", "#ff4081"];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export default function Home() {
  const [token, setToken] = useState<TokenInfo | null>(POPULAR_TOKENS[0]);
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [chartData, setChartData] = useState<LivelinePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsError, setWsError] = useState(false);
  const latestPrice = useRef<number>(0);
  const wsErrorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectToken = useCallback(async (address: string) => {
    setError(null);
    setWsError(false);

    const known = POPULAR_TOKENS.find(
      (t) => t.address.toLowerCase() === address.toLowerCase()
    );

    if (known) {
      setToken(known);
      setInputValue("");
      return;
    }

    setResolving(true);
    const info = await fetchTokenInfo(address);

    if (!info) {
      setError("Could not resolve token. Make sure it's a valid Base ERC-20 contract.");
      setResolving(false);
      return;
    }

    setToken({
      address,
      name: info.name,
      symbol: info.symbol,
      cbSymbol: `${info.symbol}-USD`,
      color: randomColor(),
    });
    setInputValue("");
    setResolving(false);
  }, []);

  const handleSubmit = useCallback(() => {
    const val = inputValue.trim();
    if (!val) return;

    if (/^0x[a-fA-F0-9]{40}$/.test(val)) {
      handleSelectToken(val);
    } else {
      setError("Please enter a valid contract address (0x...)");
    }
  }, [inputValue, handleSelectToken]);

  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;
    let flushTimer: ReturnType<typeof setInterval>;
    let dirty = false;
    let gotTick = false;

    setChartData([]);
    setPrice(null);
    setChange(null);
    setLoading(true);
    setWsError(false);

    if (wsErrorTimeout.current) clearTimeout(wsErrorTimeout.current);

    const connect = () => {
      ws = new WebSocket(CB_WS_URL);

      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: [token.cbSymbol],
            channels: ["ticker"],
          })
        );

        wsErrorTimeout.current = setTimeout(() => {
          if (!gotTick) {
            setWsError(true);
            setLoading(false);
          }
        }, 8000);
      };

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);

        if (msg.type === "error") {
          setWsError(true);
          setLoading(false);
          return;
        }

        if (msg.type === "ticker" && msg.product_id === token.cbSymbol) {
          gotTick = true;
          const p = parseFloat(msg.price);
          if (!Number.isFinite(p)) return;
          latestPrice.current = p;
          dirty = true;

          const open = parseFloat(msg.open_24h);
          if (Number.isFinite(open) && open > 0) {
            const pctChange = ((p - open) / open) * 100;
            setChange(pctChange);
          }
        }
      };

      ws.onclose = () => {
        if (ws) setTimeout(connect, 2000);
      };
    };

    connect();

    flushTimer = setInterval(() => {
      if (!dirty) return;
      dirty = false;
      const p = latestPrice.current;
      setPrice(p);
      setChartData((prev) => [...prev, { time: Date.now() / 1000, value: p }]);
      setLoading(false);
    }, FLUSH_INTERVAL_MS);

    return () => {
      const socket = ws;
      ws = null;
      socket?.close();
      clearInterval(flushTimer);
      if (wsErrorTimeout.current) clearTimeout(wsErrorTimeout.current);
    };
  }, [token]);


  const decimals = price !== null ? getDecimalPlaces(price) : 2;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
        {token && (
          <>
            <div className="flex items-center gap-2 text-zinc-400 text-sm font-mono">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: token.color }}
              />
              <span className="text-zinc-200 font-semibold">{token.name}</span>
              <span className="text-zinc-500">{token.symbol}</span>
              <span className="text-zinc-600 hidden sm:inline">
                · Base
              </span>
            </div>

            <div
              className="eth-price font-medium text-center text-white font-mono"
            >
              {wsError ? (
                <div className="text-lg text-zinc-500">
                  Token not supported by Coinbase.
                  <br />
                  <span className="text-sm text-zinc-600">
                    Try a different token or check the symbol: {token.cbSymbol}
                  </span>
                </div>
              ) : price !== null ? (
                <>
                  <NumberFlow
                    value={price}
                    format={{
                      style: "currency",
                      currency: "USD",
                      currencyDisplay: "narrowSymbol",
                      maximumFractionDigits: decimals,
                      minimumFractionDigits: decimals,
                    }}
                  />
                  {change !== null && (
                    <div
                      className={`eth-change font-mono ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}
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
                      <span className="ml-1 text-zinc-500 text-[0.65em]">24h</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-2xl text-zinc-500">Loading...</div>
              )}
            </div>

            {!wsError && (
              <div className="w-full max-w-3xl" style={{ height: 300 }}>
                <Liveline
                  data={chartData}
                  value={latestPrice.current}
                  color={token.color}
                  theme="dark"
                  loading={loading}
        exaggerate
        degen
        grid
        badge
        pulse
        scrub
        momentum
                  formatValue={formatPrice}
                  windows={[
                    { label: "30s", secs: 30 },
                    { label: "1m", secs: 60 },
                    { label: "2m", secs: 120 },
                    { label: "5m", secs: 300 },
                  ]}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 w-full px-4 pb-4 pt-2 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="flex flex-wrap gap-2 justify-center">
            {POPULAR_TOKENS.map((t) => (
              <PromptSuggestion
                key={t.address}
                onClick={() => handleSelectToken(t.address)}
                className="border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                  style={{ backgroundColor: t.color }}
                />
                {t.symbol}
              </PromptSuggestion>
            ))}
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <PromptInput
            value={inputValue}
            onValueChange={setInputValue}
            onSubmit={handleSubmit}
            isLoading={resolving}
          >
            <PromptInputTextarea
              placeholder="Paste Base token contract address (0x...)"
            />
            <PromptInputActions className="justify-end px-2 pb-1">
              <PromptInputAction tooltip="Search token">
                <Button
                  variant="default"
                  size="icon"
                  className="rounded-full size-8"
                  disabled={resolving || !inputValue.trim()}
                  onClick={handleSubmit}
                >
                  {resolving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
