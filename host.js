const express = require('express');
const https = require('https');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3000;

console.log("========================================");
console.log("Host: Starting Binance Price Oracle Server");
console.log("========================================");

// Middleware
app.use(express.json());

// In-memory storage for signed prices
const signedPrices = {
  BTC: null,
  ETH: null,
  SOL: null
};

// Binance symbols mapping
const BINANCE_SYMBOLS = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT'
};

// Function to fetch Binance price with TLS certificate
function fetchBinancePriceWithTLS(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://api.binance.us/api/v3/ticker/price?symbol=${symbol}`;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      agent: false,
      rejectUnauthorized: true
    };

    const request = https.get(options, (response) => {
      let data = '';

      // Capture TLS certificate information
      const socket = response.socket;
      const cert = socket.getPeerCertificate(true);
      const certChain = socket.getPeerCertificateChain ? socket.getPeerCertificateChain() : [];

      console.log(`✓ TLS connection established for ${symbol}`);

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const priceData = JSON.parse(data);
          console.log(`✓ Raw Binance response for ${symbol}:`, JSON.stringify(priceData, null, 2));
          console.log(`✓ Price data fetched for ${symbol}: $${priceData.price}`);

          // Prepare data with TLS certificate information
          const responseWithCert = {
            priceData: {
              symbol: symbol,
              price: parseFloat(priceData.price),
              timestamp: new Date().toISOString()
            },
            tlsCertificate: {
              certificate: cert.raw ? cert.raw.toString('base64') : (cert.pemEncoded || null),
              certificateChain: certChain.map(c => c.raw ? c.raw.toString('base64') : (c.pemEncoded || null)).filter(Boolean),
              subject: cert.subject,
              issuer: cert.issuer,
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              fingerprint: cert.fingerprint,
              serialNumber: cert.serialNumber
            },
            source: url
          };

          console.log(`✓ Prepared price data for ${symbol}:`, JSON.stringify(responseWithCert.priceData, null, 2));
          resolve(responseWithCert);
        } catch (error) {
          reject(new Error(`Error parsing Binance response for ${symbol}: ${error.message}`));
        }
      });
    });

    request.on('error', (error) => {
      reject(new Error(`Network request failed for ${symbol}: ${error.message}`));
    });

    request.on('tlsClientError', (error) => {
      reject(new Error(`TLS error for ${symbol}: ${error.message}`));
    });
  });
}

// Function to communicate with enclave
function communicateWithEnclave(data) {
  return new Promise((resolve, reject) => {
    const TCP_HOST = '127.0.0.1';
    const TCP_PORT = 8080;

    const client = net.createConnection(TCP_PORT, TCP_HOST, () => {
      console.log("✓ Connected to enclave");
      client.write(JSON.stringify(data));
      client.end();
    });

    let response = '';

    client.on('data', (chunk) => {
      response += chunk.toString();
    });

    client.on('end', () => {
      try {
        const result = JSON.parse(response);
        resolve(result);
      } catch (error) {
        reject(new Error(`Error parsing enclave response: ${error.message}`));
      }
    });

    client.on('error', (error) => {
      reject(new Error(`Error connecting to enclave: ${error.message}`));
    });
  });
}

// Function to get enclave public key
async function getEnclavePublicKey() {
  try {
    const response = await communicateWithEnclave({ type: 'getPublicKey' });
    if (response.success) {
      console.log("✓ Retrieved enclave public key:", response.publicKey);
      return response.publicKey;
    } else {
      throw new Error("Failed to get public key from enclave");
    }
  } catch (error) {
    console.error("✗ Error getting enclave public key:", error.message);
    return null;
  }
}

// Function to validate and sign price with enclave
async function validateAndSignPrice(priceWithTLS) {
  try {
    const request = {
      type: 'validateAndSign',
      priceData: priceWithTLS.priceData,
      tlsCertificate: priceWithTLS.tlsCertificate
    };

    const response = await communicateWithEnclave(request);

    if (response.success) {
      console.log(`✓ Price validated and signed for ${priceWithTLS.priceData.symbol}`);
      return response.signedPrice;
    } else {
      console.error(`✗ Enclave validation failed for ${priceWithTLS.priceData.symbol}:`, response.error);
      return null;
    }
  } catch (error) {
    console.error(`✗ Error validating price for ${priceWithTLS.priceData.symbol}:`, error.message);
    return null;
  }
}

// Function to fetch and process all prices
async function fetchAndProcessPrices() {
  console.log("========================================");
  console.log("Host: Fetching prices from Binance...");
  console.log("========================================");

  for (const [tokenSymbol, binanceSymbol] of Object.entries(BINANCE_SYMBOLS)) {
    try {
      // Fetch price with TLS data
      const priceWithTLS = await fetchBinancePriceWithTLS(binanceSymbol);

      // Validate and sign with enclave
      const signedPrice = await validateAndSignPrice(priceWithTLS);

      if (signedPrice) {
        signedPrices[tokenSymbol] = signedPrice;
        console.log(`✓ Updated signed price for ${tokenSymbol}: $${signedPrice.price}`);
      }
    } catch (error) {
      console.error(`✗ Error processing ${tokenSymbol}:`, error.message);
    }
  }

  console.log("========================================");
}

// Price endpoints
app.get('/price/BTC', (req, res) => {
  if (signedPrices.BTC) {
    res.json({
      success: true,
      data: signedPrices.BTC
    });
  } else {
    res.status(503).json({
      success: false,
      error: 'BTC price not available yet'
    });
  }
});

app.get('/price/ETH', (req, res) => {
  if (signedPrices.ETH) {
    res.json({
      success: true,
      data: signedPrices.ETH
    });
  } else {
    res.status(503).json({
      success: false,
      error: 'ETH price not available yet'
    });
  }
});

app.get('/price/SOL', (req, res) => {
  if (signedPrices.SOL) {
    res.json({
      success: true,
      data: signedPrices.SOL
    });
  } else {
    res.status(503).json({
      success: false,
      error: 'SOL price not available yet'
    });
  }
});

// Get all prices endpoint
app.get('/prices', (req, res) => {
  res.json({
    success: true,
    data: signedPrices,
    lastUpdated: new Date().toISOString()
  });
});

// Get enclave public key endpoint
app.get('/public-key', async (req, res) => {
  try {
    const publicKey = await getEnclavePublicKey();
    if (publicKey) {
      res.json({
        success: true,
        publicKey: publicKey
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Unable to retrieve public key from enclave'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const availablePrices = Object.keys(signedPrices).filter(key => signedPrices[key] !== null);
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    availablePrices: availablePrices,
    totalPrices: availablePrices.length
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`✓ Express server running on port ${PORT}`);
  console.log(`✓ GET /price/BTC - Get signed Bitcoin price`);
  console.log(`✓ GET /price/ETH - Get signed Ethereum price`);
  console.log(`✓ GET /price/SOL - Get signed Solana price`);
  console.log(`✓ GET /prices - Get all signed prices`);
  console.log(`✓ GET /public-key - Get enclave public key`);
  console.log(`✓ GET /health - Health check`);
  console.log("========================================");

  // Wait a moment for enclave to be ready, then start price fetching
  setTimeout(() => {
    console.log("Starting price fetching cycle...");

    // Fetch prices immediately
    fetchAndProcessPrices();

    // Set up interval to fetch prices every 5 seconds
    setInterval(fetchAndProcessPrices, 5000);
  }, 2000);
}); 