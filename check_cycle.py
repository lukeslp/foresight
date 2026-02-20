import sqlite3

db = sqlite3.connect("foresight.db")
db.row_factory = sqlite3.Row

cycle_id = 1921

rows = db.execute("""
    SELECT s.ticker, p.predicted_direction, p.confidence, p.provider, s.name
    FROM predictions p
    JOIN stocks s ON p.stock_id = s.id
    WHERE p.cycle_id = ?
    ORDER BY s.ticker
""", (cycle_id,)).fetchall()

crypto = [r for r in rows if "-USD" in (r["ticker"] or "")]
equity = [r for r in rows if "-USD" not in (r["ticker"] or "") and "MARKET" not in (r["ticker"] or "")]
market = [r for r in rows if "MARKET" in (r["ticker"] or "")]

print(f"Cycle {cycle_id}: {len(rows)} total, {len(crypto)} crypto, {len(equity)} equity, {len(market)} market")

if crypto:
    unique_crypto = sorted(set(r["ticker"] for r in crypto))
    print(f"Crypto tickers ({len(unique_crypto)}): {unique_crypto[:10]}")

if not crypto:
    print("\nNO CRYPTO in this cycle!")
    crypto_stocks = db.execute("SELECT ticker FROM stocks WHERE ticker LIKE '%-USD' LIMIT 10").fetchall()
    print(f"Crypto in stocks table: {[r['ticker'] for r in crypto_stocks]}")

if market:
    for m in market:
        print(f"Market: {m['ticker']} -> {m['predicted_direction']} (conf={m['confidence']})")
else:
    print("\nNO MARKET predictions!")

consensus = [r for r in rows if "consensus" in (r["provider"] or "") or "council" in (r["provider"] or "")]
print(f"\nConsensus: {len(consensus)}")
for c in consensus[:5]:
    print(f"  {c['ticker']}: {c['predicted_direction']} conf={c['confidence']} via {c['provider']}")

db.close()
