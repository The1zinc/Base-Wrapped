"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const BLOCKSCOUT_API = "https://base.blockscout.com/api/v2";
const LOOKBACK_DAYS = 30;
const WEI_PER_ETH = BigInt("1000000000000000000");
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

type AddressSummaryResponse = {
  coin_balance: string;
  exchange_rate: string | null;
  hash: string;
  is_contract: boolean;
  name: string | null;
};

type AddressCountersResponse = {
  gas_usage_count: string;
  token_transfers_count: string;
  transactions_count: string;
};

type TransactionItem = {
  hash: string;
  from?: { hash?: string | null } | null;
  timestamp: string;
  to?: { hash?: string | null } | null;
  value: string;
};

type TransactionsResponse = {
  items: TransactionItem[];
};

type WrappedBadge = {
  reason: string;
  title: string;
};

type WrappedSnapshot = {
  activeDays: number;
  address: string;
  balanceEth: string;
  balanceUsd: number;
  badge: WrappedBadge;
  entityType: "contract" | "wallet";
  gasUnits: string;
  inboundTxs30d: number;
  largestTransferEth30d: string;
  lifetimeTxs: number;
  mostActiveHourUtc: number;
  name: string | null;
  outboundTxs30d: number;
  shortAddress: string;
  tokenTransfers: number;
  txsLast30Days: number;
};

type EthereumProvider = {
  request: (payload: { method: string }) => Promise<string[]>;
};

function isAddress(value: string): boolean {
  return ADDRESS_REGEX.test(value.trim());
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function parseBigInt(value: string | undefined): bigint {
  if (!value) {
    return BigInt(0);
  }

  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

function weiToEth(weiValue: string | undefined, maxFractionDigits = 4): string {
  const wei = parseBigInt(weiValue);
  const whole = wei / WEI_PER_ETH;
  const fraction = wei % WEI_PER_ETH;

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  const paddedFraction = fraction.toString().padStart(18, "0");
  const croppedFraction = paddedFraction.slice(0, maxFractionDigits).replace(/0+$/, "");

  return croppedFraction ? `${whole}.${croppedFraction}` : whole.toString();
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getBadge(lifetimeTxs: number, txsLast30Days: number, activeDays: number): WrappedBadge {
  if (txsLast30Days >= 120 || lifetimeTxs >= 10_000) {
    return {
      title: "Base Power User",
      reason: "High-volume activity with a strong recent rhythm.",
    };
  }

  if (txsLast30Days >= 50 || lifetimeTxs >= 2_000) {
    return {
      title: "Onchain Explorer",
      reason: "You are consistently active across the Base ecosystem.",
    };
  }

  if (activeDays >= 10 || txsLast30Days >= 15) {
    return {
      title: "Momentum Builder",
      reason: "Good cadence. Your wallet keeps showing up week after week.",
    };
  }

  return {
    title: "Fresh Starter",
    reason: "Early-stage wallet profile with room to build your streak.",
  };
}

function formatHourUtc(hour: number): string {
  if (hour < 0) {
    return "Not enough data";
  }

  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  const period = hour < 12 ? "AM" : "PM";
  return `${normalized}:00 ${period} UTC`;
}

function createShareMessage(snapshot: WrappedSnapshot): string {
  return [
    "Wallet Wrapped on Base",
    `${snapshot.shortAddress} • ${snapshot.badge.title}`,
    `Lifetime tx: ${formatCount(snapshot.lifetimeTxs)}`,
    `Last 30d tx: ${formatCount(snapshot.txsLast30Days)}`,
    `Active days: ${snapshot.activeDays}/30`,
    `Balance: ${snapshot.balanceEth} ETH`,
  ].join("\n");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Blockscout request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

function buildSnapshot(
  targetAddress: string,
  summary: AddressSummaryResponse,
  counters: AddressCountersResponse,
  transactions: TransactionItem[],
): WrappedSnapshot {
  const now = Date.now();
  const thirtyDaysAgo = now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const lowerAddress = targetAddress.toLowerCase();

  const recentTransactions = transactions.filter((transaction) => {
    const timestamp = parseTimestamp(transaction.timestamp);
    return timestamp >= thirtyDaysAgo;
  });

  const activeDays = new Set(
    recentTransactions.map((transaction) => new Date(transaction.timestamp).toISOString().slice(0, 10)),
  ).size;

  const inboundTxs30d = recentTransactions.filter(
    (transaction) => transaction.to?.hash?.toLowerCase() === lowerAddress,
  ).length;

  const outboundTxs30d = recentTransactions.filter(
    (transaction) => transaction.from?.hash?.toLowerCase() === lowerAddress,
  ).length;

  const hourBuckets = new Array<number>(24).fill(0);
  for (const transaction of recentTransactions) {
    const date = new Date(transaction.timestamp);
    if (!Number.isNaN(date.getTime())) {
      hourBuckets[date.getUTCHours()] += 1;
    }
  }

  const maxHourCount = Math.max(...hourBuckets);
  const mostActiveHourUtc = maxHourCount > 0 ? hourBuckets.indexOf(maxHourCount) : -1;

  let largestTransferWei = BigInt(0);
  for (const transaction of recentTransactions) {
    const valueWei = parseBigInt(transaction.value);
    if (valueWei > largestTransferWei) {
      largestTransferWei = valueWei;
    }
  }

  const txsLast30Days = recentTransactions.length;
  const lifetimeTxs = Number.parseInt(counters.transactions_count, 10) || 0;
  const tokenTransfers = Number.parseInt(counters.token_transfers_count, 10) || 0;
  const gasUnitsRaw = Number.parseInt(counters.gas_usage_count, 10);
  const gasUnits = Number.isNaN(gasUnitsRaw) ? counters.gas_usage_count : formatCount(gasUnitsRaw);

  const balanceEth = weiToEth(summary.coin_balance, 6);
  const exchangeRate = Number.parseFloat(summary.exchange_rate ?? "0");
  const balanceUsd = Number.parseFloat(balanceEth) * (Number.isFinite(exchangeRate) ? exchangeRate : 0);

  return {
    activeDays,
    address: targetAddress,
    balanceEth,
    balanceUsd,
    badge: getBadge(lifetimeTxs, txsLast30Days, activeDays),
    entityType: summary.is_contract ? "contract" : "wallet",
    gasUnits,
    inboundTxs30d,
    largestTransferEth30d: weiToEth(largestTransferWei.toString(), 6),
    lifetimeTxs,
    mostActiveHourUtc,
    name: summary.name,
    outboundTxs30d,
    shortAddress: shortAddress(targetAddress),
    tokenTransfers,
    txsLast30Days,
  };
}

export default function Home() {
  const [addressInput, setAddressInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isShareCopied, setIsShareCopied] = useState(false);
  const [snapshot, setSnapshot] = useState<WrappedSnapshot | null>(null);

  const shareMessage = useMemo(() => {
    if (!snapshot) {
      return "";
    }

    return createShareMessage(snapshot);
  }, [snapshot]);

  const loadSnapshot = useCallback(async (rawAddress: string): Promise<void> => {
    const normalizedAddress = rawAddress.trim();
    setIsLoading(true);
    setErrorMessage("");
    setIsShareCopied(false);

    try {
      const [summary, counters, transactions] = await Promise.all([
        fetchJson<AddressSummaryResponse>(`${BLOCKSCOUT_API}/addresses/${normalizedAddress}`),
        fetchJson<AddressCountersResponse>(`${BLOCKSCOUT_API}/addresses/${normalizedAddress}/counters`),
        fetchJson<TransactionsResponse>(`${BLOCKSCOUT_API}/addresses/${normalizedAddress}/transactions`),
      ]);

      setSnapshot(buildSnapshot(normalizedAddress, summary, counters, transactions.items));
    } catch {
      setSnapshot(null);
      setErrorMessage("Could not fetch this wallet right now. Check the address and try again in a moment.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function handleUseConnectedWallet(): Promise<void> {
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;

    if (!ethereum) {
      setErrorMessage("No browser wallet found. Paste a Base address manually.");
      return;
    }

    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const walletAddress = accounts[0]?.trim();

      if (!walletAddress || !isAddress(walletAddress)) {
        setErrorMessage("Wallet returned an invalid address.");
        return;
      }

      setAddressInput(walletAddress);
      await loadSnapshot(walletAddress);
    } catch {
      setErrorMessage("Wallet connection was cancelled or unavailable.");
    }
  }

  async function handleCopyShare(): Promise<void> {
    if (!shareMessage || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(shareMessage);
    setIsShareCopied(true);
    window.setTimeout(() => setIsShareCopied(false), 2200);
  }

  async function handleNativeShare(): Promise<void> {
    if (!shareMessage) {
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          text: shareMessage,
          url: process.env.NEXT_PUBLIC_URL,
        });
        return;
      } catch {
        // Continue to clipboard fallback.
      }
    }

    await handleCopyShare();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalizedAddress = addressInput.trim();

    if (!isAddress(normalizedAddress)) {
      setErrorMessage("Enter a valid EVM address (0x + 40 hex chars).");
      return;
    }

    void loadSnapshot(normalizedAddress);
  }

  useEffect(() => {
    void sdk.actions.ready().catch(() => undefined);

    const addressFromQuery = new URLSearchParams(window.location.search).get("address");
    if (addressFromQuery && isAddress(addressFromQuery)) {
      setAddressInput(addressFromQuery);
      void loadSnapshot(addressFromQuery);
    }
  }, [loadSnapshot]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <p className={styles.kicker}>Base Mini App</p>
          <h1>Wallet Wrapped</h1>
          <p>
            Paste any Base wallet and get an instant wrapped snapshot: activity pace, balance pulse, and share-ready
            highlights.
          </p>
        </header>

        <section className={styles.panel}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label htmlFor="walletAddress">Wallet address</label>
            <input
              id="walletAddress"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x..."
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
            />

            <div className={styles.actions}>
              <button type="submit" className={styles.primaryButton} disabled={isLoading}>
                {isLoading ? "Analyzing..." : "Analyze Wallet"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void handleUseConnectedWallet()}
                disabled={isLoading}
              >
                Use Connected Wallet
              </button>
            </div>
          </form>

          <p className={styles.hint}>No backend, no signatures, no storage. Data is pulled directly from public Base explorer APIs.</p>

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        </section>

        {isLoading ? (
          <section className={styles.loadingCard}>
            <p>Crunching your onchain rhythm...</p>
          </section>
        ) : null}

        {snapshot ? (
          <>
            <section className={styles.heroCard}>
              <div>
                <p className={styles.badge}>{snapshot.badge.title}</p>
                <h2>{snapshot.name ?? snapshot.shortAddress}</h2>
                <p>{snapshot.badge.reason}</p>
                <p className={styles.meta}>
                  {snapshot.entityType} • {snapshot.address}
                </p>
              </div>
              <div className={styles.scoreCard}>
                <span>30d consistency</span>
                <strong>{Math.round((snapshot.activeDays / LOOKBACK_DAYS) * 100)}%</strong>
                <small>{snapshot.activeDays} active days in the last 30</small>
              </div>
            </section>

            <section className={styles.metricsGrid}>
              <article className={styles.metricCard}>
                <p>Lifetime transactions</p>
                <h3>{formatCount(snapshot.lifetimeTxs)}</h3>
              </article>

              <article className={styles.metricCard}>
                <p>Transactions (30d)</p>
                <h3>{formatCount(snapshot.txsLast30Days)}</h3>
              </article>

              <article className={styles.metricCard}>
                <p>Token transfers</p>
                <h3>{formatCount(snapshot.tokenTransfers)}</h3>
              </article>

              <article className={styles.metricCard}>
                <p>Wallet balance</p>
                <h3>{snapshot.balanceEth} ETH</h3>
                <small>{formatUsd(snapshot.balanceUsd)}</small>
              </article>

              <article className={styles.metricCard}>
                <p>Lifetime gas units</p>
                <h3>{snapshot.gasUnits}</h3>
              </article>

              <article className={styles.metricCard}>
                <p>Peak active hour</p>
                <h3>{formatHourUtc(snapshot.mostActiveHourUtc)}</h3>
              </article>
            </section>

            <section className={styles.bottomGrid}>
              <article className={styles.detailCard}>
                <h3>30-day activity split</h3>
                <ul>
                  <li>
                    <span>Outgoing tx</span>
                    <strong>{formatCount(snapshot.outboundTxs30d)}</strong>
                  </li>
                  <li>
                    <span>Incoming tx</span>
                    <strong>{formatCount(snapshot.inboundTxs30d)}</strong>
                  </li>
                  <li>
                    <span>Largest transfer</span>
                    <strong>{snapshot.largestTransferEth30d} ETH</strong>
                  </li>
                </ul>
              </article>

              <article className={styles.detailCard}>
                <h3>Share your wrapped</h3>
                <pre>{shareMessage}</pre>
                <div className={styles.actions}>
                  <button type="button" className={styles.primaryButton} onClick={() => void handleNativeShare()}>
                    Share
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={() => void handleCopyShare()}>
                    {isShareCopied ? "Copied" : "Copy text"}
                  </button>
                </div>
              </article>
            </section>
          </>
        ) : null}

        <footer className={styles.footer}>
          Built for Vercel Hobby: static-first UI with direct reads from Base public APIs.
        </footer>
      </main>
    </div>
  );
}
