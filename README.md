# THORChainTxs - Query script

This repo includes a small Node.js script to query THORChain transactions for addresses listed in `data/chains.txt`.

Usage

- Install dependencies:

```bash
npm install
```

- List parsed addresses/exchanges:

```bash
npm run query -- --list
```

- Query by exchange (matches the text after the comma in `data/chains.txt`):

```bash
npm run query -- --exchange "XDEFI 3 THORChain"
```

- Or query directly by address:

```bash
npm run query -- --address thor1pd3d5jadt4xrlhsfec27p6snfzfs4ykw3ahnu6
```

Notes

- The script will first attempt to use `@xchainjs/xchain-thorchain-query` if available. If the package's runtime API differs, the script falls back to calling Midgard's public endpoint as a best-effort fallback.
- The script accepts commented lines in `data/chains.txt` (lines starting with `#`) and will parse them as well.
