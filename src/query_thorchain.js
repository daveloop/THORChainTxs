const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Try to require the xchain thorchain query package if available
let xchainThor;
try {
  xchainThor = require('@xchainjs/xchain-thorchain-query');
} catch (e) {
  xchainThor = null;
}

const CHAINS_FILE = path.join(__dirname, '..', 'data', 'chains.txt');

function parseChainsFile(content) {
  const rows = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const result = rows.map(line => {
    const clean = line.replace(/^\s*#\s*/, ''); // allow commented lines
    const idx = clean.indexOf(',');
    if (idx === -1) return null;
    const addr = clean.slice(0, idx).trim();
    let exch = clean.slice(idx + 1).trim();
    // remove surrounding quotes if present
    if ((exch.startsWith('"') && exch.endsWith('"')) || (exch.startsWith("'") && exch.endsWith("'"))) {
      exch = exch.slice(1, -1);
    }
    return { address: addr, exchange: exch };
  }).filter(Boolean);
  return result;
}

function findByAlias(list, alias) {
  const key = alias.replace(/\s+/g, '').toLowerCase();
  return list.find(item => {
    const candidate = (item.exchange || '').replace(/\s+/g, '').toLowerCase();
    if (candidate === key) return true;
    // also allow prefix match like 'xdefi1' matching 'XDEFI 1 THORChain'
    return candidate.includes(key);
  });
}

async function queryMidgard(address) {
  // Midgard v2 actions endpoint (best-effort fallback)
  const url = `https://midgard.thorchain.info/v2/actions?address=${address}&limit=100`;
  const resp = await axios.get(url, { timeout: 15000 });
  return resp.data;
}

async function queryWithXchain(address) {
  if (!xchainThor) throw new Error('xchain thorchain query package not installed');
  // Attempt several possible client constructors / methods by introspection
  const mod = xchainThor;
  // If module exports a default/class
  let client = null;
  if (typeof mod === 'function') {
    try { client = new mod({ network: 'mainnet' }); } catch (e) { client = null; }
  } else if (mod && typeof mod.default === 'function') {
    try { client = new mod.default({ network: 'mainnet' }); } catch (e) { client = null; }
  } else if (mod && mod.ThorchainQuery) {
    try { client = new mod.ThorchainQuery({ network: 'mainnet' }); } catch (e) { client = null; }
  }

  if (!client) {
    // return null to indicate we couldn't instantiate client
    return null;
  }

  // try common method names
  const tryNames = ['getTransactions', 'getTxs', 'getAddressTransactions', 'transactionsByAddress', 'getTxByAddress', 'getAddressTxs'];
  for (const name of tryNames) {
    if (typeof client[name] === 'function') {
      try {
        return await client[name](address);
      } catch (e) {
        // continue to next
      }
    }
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node src/query_thorchain.js --address <address> | --exchange <name> | --list [--out <path>]');
    process.exit(1);
  }

  const raw = fs.readFileSync(CHAINS_FILE, 'utf8');
  const rows = parseChainsFile(raw);

  if (argv.includes('--list')) {
    rows.forEach(r => console.log(`${r.address}  ,  ${r.exchange}`));
    process.exit(0);
  }

  let target;
  const idxA = argv.indexOf('--address');
  if (idxA !== -1) {
    target = { address: argv[idxA + 1], exchange: '' };
  }
  const idxE = argv.indexOf('--exchange');
  if (idxE !== -1) {
    const q = argv[idxE + 1];
    const found = findByAlias(rows, q);
    if (!found) {
      console.error('Exchange not found in chains file:', q);
      process.exit(2);
    }
    target = found;
  }

  const idxOut = argv.indexOf('--out');
  let outPath = null;
  if (idxOut !== -1) {
    outPath = argv[idxOut + 1];
  }

  if (!target) {
    console.error('No target specified. Use --address or --exchange');
    process.exit(1);
  }

  if (!outPath) console.log('Querying transactions for', target.address, '(', target.exchange, ')');

  // First, try using xchain package if available
  try {
    const res = await queryWithXchain(target.address);
    if (res) {
      if (outPath) {
        const outDir = path.dirname(outPath);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(res, null, 2), 'utf8');
        console.log('Saved raw response to', outPath);
        return;
      }
      console.log('Results (from @xchainjs/xchain-thorchain-query):');
      console.log(JSON.stringify(res, null, 2));
      return;
    }
  } catch (e) {
    // fallthrough to midgard
  }

  // Fallback to Midgard
  try {
    const res = await queryMidgard(target.address);
    if (outPath) {
      const outDir = path.dirname(outPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(res, null, 2), 'utf8');
      console.log('Saved raw response to', outPath);
      return;
    }
    console.log('Results (from Midgard fallback):');
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('Failed to fetch transactions:', e.message);
    process.exit(3);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err && err.message ? err.message : err);
  process.exit(4);
});
