"use client";

import { sdk } from "@farcaster/miniapp-sdk";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

const BLOCKSCOUT_API = "https://base.blockscout.com/api/v2";
const LOOKBACK_DAYS = 30;
const REQUEST_TIMEOUT_MS = 15_000;
const WEI_PER_ETH = BigInt("1000000000000000000");
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const THEME_STORAGE_KEY = "base-wallet-wrapped-theme-v2";

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
  lifetimeTxs: string;
  mostActiveHourUtc: number;
  name: string | null;
  outboundTxs30d: number;
  shortAddress: string;
  tokenTransfers: string;
  txsLast30Days: number;
};

type ThemeMode = "dark" | "light";

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

function formatBigIntCount(value: bigint): string {
  const absolute = value < BigInt(0) ? -value : value;
  const sign = value < BigInt(0) ? "-" : "";
  const withSeparators = absolute.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${withSeparators}`;
}

function toSafeNonNegativeNumber(value: bigint): number {
  if (value <= BigInt(0)) {
    return 0;
  }

  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (value >= maxSafe) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(value);
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
      reason: "Consistently active across the Base ecosystem.",
    };
  }

  if (activeDays >= 10 || txsLast30Days >= 15) {
    return {
      title: "Momentum Builder",
      reason: "Good cadence with repeat activity across the month.",
    };
  }

  return {
    title: "Fresh Starter",
    reason: "Early-stage profile with room to build a stronger streak.",
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
    "Base Wallet Wrapped",
    `${snapshot.shortAddress} - ${snapshot.badge.title}`,
    `Lifetime tx: ${snapshot.lifetimeTxs}`,
    `Last 30d tx: ${formatCount(snapshot.txsLast30Days)}`,
    `Active days: ${snapshot.activeDays}/30`,
    `Balance: ${snapshot.balanceEth} ETH`,
  ].join("\n");
}

class RequestAbortedError extends Error {
  constructor() {
    super("Request aborted");
    this.name = "RequestAbortedError";
  }
}

class RequestTimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "RequestTimeoutError";
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const timeoutController = new AbortController();
  let didTimeout = false;

  const handleUpstreamAbort = () => {
    timeoutController.abort();
  };

  signal?.addEventListener("abort", handleUpstreamAbort, { once: true });

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    timeoutController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      throw new Error(`Blockscout request failed (${response.status}).`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (didTimeout) {
        throw new RequestTimeoutError();
      }

      throw new RequestAbortedError();
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", handleUpstreamAbort);
  }
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
  const lifetimeTxsRaw = parseBigInt(counters.transactions_count);
  const tokenTransfersRaw = parseBigInt(counters.token_transfers_count);
  const gasUnitsRaw = parseBigInt(counters.gas_usage_count);

  const lifetimeTxsForBadge = toSafeNonNegativeNumber(lifetimeTxsRaw);
  const lifetimeTxs = formatBigIntCount(lifetimeTxsRaw);
  const tokenTransfers = formatBigIntCount(tokenTransfersRaw);
  const gasUnits = formatBigIntCount(gasUnitsRaw);

  const balanceEth = weiToEth(summary.coin_balance, 6);
  const exchangeRate = Number.parseFloat(summary.exchange_rate ?? "0");
  const balanceUsd = Number.parseFloat(balanceEth) * (Number.isFinite(exchangeRate) ? exchangeRate : 0);

  return {
    activeDays,
    address: targetAddress,
    balanceEth,
    balanceUsd,
    badge: getBadge(lifetimeTxsForBadge, txsLast30Days, activeDays),
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
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const isIdleState = !snapshot && !isLoading;
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const shareMessage = useMemo(() => {
    if (!snapshot) {
      return "";
    }

    return createShareMessage(snapshot);
  }, [snapshot]);

  const applyTheme = useCallback((nextTheme: ThemeMode): void => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, []);

  const loadSnapshot = useCallback(async (rawAddress: string): Promise<void> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    abortControllerRef.current?.abort();
    const requestController = new AbortController();
    abortControllerRef.current = requestController;

    const normalizedAddress = rawAddress.trim();
    setIsLoading(true);
    setErrorMessage("");
    setIsShareCopied(false);

    try {
      const [summary, counters, transactions] = await Promise.all([
        fetchJson<AddressSummaryResponse>(`${BLOCKSCOUT_API}/addresses/${normalizedAddress}`, requestController.signal),
        fetchJson<AddressCountersResponse>(
          `${BLOCKSCOUT_API}/addresses/${normalizedAddress}/counters`,
          requestController.signal,
        ),
        fetchJson<TransactionsResponse>(`${BLOCKSCOUT_API}/addresses/${normalizedAddress}/transactions`, requestController.signal),
      ]);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setSnapshot(buildSnapshot(normalizedAddress, summary, counters, transactions.items));
    } catch (error) {
      if (requestId !== requestIdRef.current || error instanceof RequestAbortedError) {
        return;
      }

      setSnapshot(null);

      if (error instanceof RequestTimeoutError) {
        setErrorMessage("Request timed out while reading Base explorer data. Please retry.");
        return;
      }

      setErrorMessage("Could not fetch this wallet right now. Check the address and try again in a moment.");
    } finally {
      if (requestId === requestIdRef.current) {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  function handleThemeToggle(): void {
    applyTheme(theme === "dark" ? "light" : "dark");
  }

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
    if (!shareMessage) {
      return;
    }

    if (!navigator.clipboard) {
      setErrorMessage("Clipboard is unavailable on this device.");
      return;
    }

    try {
      await navigator.clipboard.writeText(shareMessage);
      setIsShareCopied(true);
      window.setTimeout(() => setIsShareCopied(false), 2200);
    } catch {
      setErrorMessage("Could not copy to clipboard. Please copy manually from the share card.");
    }
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
    return () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    void sdk.actions.ready().catch(() => undefined);

    let storedTheme: string | null = null;
    try {
      storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Ignore storage errors in restricted environments.
    }

    const initialTheme: ThemeMode = storedTheme === "dark" || storedTheme === "light" ? storedTheme : "dark";
    applyTheme(initialTheme);

    const addressFromQuery = new URLSearchParams(window.location.search).get("address");
    if (addressFromQuery && isAddress(addressFromQuery)) {
      setAddressInput(addressFromQuery);
      void loadSnapshot(addressFromQuery);
    }
  }, [applyTheme, loadSnapshot]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <nav className={styles.topBar} aria-label="App navigation">
          <div className={styles.brand}>
            <span className={styles.brandMark}>B</span>
            <span>Base Wallet</span>
          </div>

          <button
            type="button"
            className={`${styles.themeToggle} ${theme === "light" ? styles.themeToggleLight : ""}`}
            onClick={handleThemeToggle}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            <span className={styles.themeThumb} aria-hidden="true" />
          </button>
        </nav>

        <section className={styles.hero}>
          <h1>Base Wallet Wrapped</h1>
          <p>Lookup any wallet. No sign-up needed.</p>

          <form onSubmit={handleSubmit} className={styles.lookupForm}>
            <label htmlFor="walletAddress" className={styles.srOnly}>
              Wallet address
            </label>
            <input
              id="walletAddress"
              className={styles.addressInput}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="Enter wallet address (0x...)"
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
            />

            <button type="submit" className={styles.lookupButton} disabled={isLoading}>
              {isLoading ? "Loading..." : "Lookup"}
            </button>
          </form>

          <button
            type="button"
            className={styles.walletButton}
            onClick={() => void handleUseConnectedWallet()}
            disabled={isLoading}
          >
            Connect wallet
          </button>

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        </section>

        {isIdleState ? (
          <section className={styles.previewArea} aria-label="Wallet preview">
            <article className={styles.previewCard}>
              <span>30d rhythm</span>
              <strong>Active-day cadence and transaction pace</strong>
            </article>
            <article className={styles.previewCard}>
              <span>Balance pulse</span>
              <strong>Live ETH balance plus USD value snapshot</strong>
            </article>
            <article className={styles.previewCard}>
              <span>Share card</span>
              <strong>Copy or share a compact wallet recap instantly</strong>
            </article>
          </section>
        ) : null}

        {isLoading ? (
          <section className={styles.loadingCard}>
            <p>Fetching wallet analytics...</p>
          </section>
        ) : null}

        {snapshot ? (
          <section className={styles.snapshotSection}>
            <div className={styles.sectionHeader}>
              <h2>Wallet Snapshot</h2>
              <div className={styles.chipRow}>
                <span className={styles.chip}>30D</span>
                <span className={styles.chip}>Lifetime</span>
                <span className={styles.chipActive}>{snapshot.badge.title}</span>
              </div>
            </div>

            <article className={styles.identityCard}>
              <div className={styles.identityText}>
                <h3>{snapshot.name ?? snapshot.shortAddress}</h3>
                <p>{snapshot.badge.reason}</p>
                <p className={styles.identityMeta}>
                  {snapshot.entityType} - {snapshot.address}
                </p>
              </div>

              <div className={styles.consistencyCard}>
                <span>Consistency</span>
                <strong>{Math.round((snapshot.activeDays / LOOKBACK_DAYS) * 100)}%</strong>
                <small>{snapshot.activeDays}/30 active days</small>
              </div>
            </article>

            <div className={styles.quickStats}>
              <article className={styles.quickCard}>
                <span>Incoming</span>
                <strong>{formatCount(snapshot.inboundTxs30d)}</strong>
              </article>

              <article className={styles.quickCard}>
                <span>Outgoing</span>
                <strong>{formatCount(snapshot.outboundTxs30d)}</strong>
              </article>

              <article className={styles.quickCard}>
                <span>Largest move</span>
                <strong>{snapshot.largestTransferEth30d} ETH</strong>
              </article>
            </div>

            <div className={styles.metricsGrid}>
              <article className={styles.metricCard}>
                <p>Lifetime tx</p>
                <h3>{snapshot.lifetimeTxs}</h3>
              </article>

              <article className={styles.metricCard}>
                <p>30d tx</p>
                <h3>{formatCount(snapshot.txsLast30Days)}</h3>
              </article>

              <article className={styles.metricCard}>
                <p>Token moves</p>
                <h3>{snapshot.tokenTransfers}</h3>
              </article>

              <article className={styles.metricCard}>
                <p>Balance</p>
                <h3>{snapshot.balanceEth} ETH</h3>
                <small>{formatUsd(snapshot.balanceUsd)}</small>
              </article>

              <article className={styles.metricCard}>
                <p>Gas used</p>
                <h3>{snapshot.gasUnits}</h3>
              </article>

              <article className={styles.metricCard}>
                <p>Peak hour</p>
                <h3>{formatHourUtc(snapshot.mostActiveHourUtc)}</h3>
              </article>
            </div>

            <div className={styles.bottomGrid}>
              <article className={styles.detailCard}>
                <h3>30-day split</h3>
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
                <h3>Share card</h3>
                <pre>{shareMessage}</pre>
                <div className={styles.buttonRow}>
                  <button type="button" className={styles.primaryButton} onClick={() => void handleNativeShare()}>
                    Share
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={() => void handleCopyShare()}>
                    {isShareCopied ? "Copied" : "Copy text"}
                  </button>
                </div>
              </article>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
