const express = require('express');
const https = require('https');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3000;

console.log("========================================");
console.log("Host: Starting Express server");
console.log("========================================");

// Middleware
app.use(express.json());

// Function to fetch todo data with TLS certificate
function fetchTodoWithTLS(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      // Disable connection reuse to ensure fresh certificate data
      agent: false,
      rejectUnauthorized: true
    };

    const request = https.get(options, (response) => {
      let data = '';

      // Capture TLS certificate information
      const socket = response.socket;
      const cert = socket.getPeerCertificate(true);
      const certChain = socket.getPeerCertificateChain ? socket.getPeerCertificateChain() : [];

      console.log("✓ TLS connection established and certificate captured");

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const todoData = JSON.parse(data);
          console.log("✓ API data fetched successfully");

          // Prepare data with TLS certificate information
          const responseWithCert = {
            data: todoData,
            tlsCertificate: {
              certificate: cert.raw ? cert.raw.toString('base64') : (cert.pemEncoded || null),
              certificateChain: certChain.map(c => c.raw ? c.raw.toString('base64') : (c.pemEncoded || null)).filter(Boolean),
              subject: cert.subject,
              issuer: cert.issuer,
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              fingerprint: cert.fingerprint,
              serialNumber: cert.serialNumber,
              // Add the full cert object for debugging
              _debug: {
                hasRaw: !!cert.raw,
                hasPemEncoded: !!cert.pemEncoded,
                certKeys: Object.keys(cert)
              }
            },
            timestamp: new Date().toISOString(),
            source: url
          };


          resolve(responseWithCert);
        } catch (error) {
          reject(new Error(`Error parsing API response: ${error.message}`));
        }
      });
    });

    request.on('error', (error) => {
      reject(new Error(`Network request failed: ${error.message}`));
    });

    request.on('tlsClientError', (error) => {
      reject(new Error(`TLS error: ${error.message}`));
    });
  });
}

// Function to validate data with enclave
function validateWithEnclave(data) {
  return new Promise((resolve, reject) => {
    const TCP_HOST = '127.0.0.1';
    const TCP_PORT = 8080;

    const client = net.createConnection(TCP_PORT, TCP_HOST, () => {
      console.log("✓ Connected to enclave validation server");
      // Send data to enclave
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
        if (result.success) {
          console.log("✓ Enclave validation successful");
          resolve(true);
        } else {
          console.error("✗ Enclave validation failed:", result.error);
          resolve(false);
        }
      } catch (error) {
        console.error("✗ Error parsing enclave response:", error.message);
        resolve(false);
      }
    });

    client.on('error', (error) => {
      console.error("✗ Error connecting to enclave:", error.message);
      console.error("  Make sure the enclave server is running: gramine-sgx ./nodejs enclave.js");
      resolve(false);
    });
  });
}

// GET /getTodo endpoint
app.get('/getTodo', async (_, res) => {
  try {
    console.log("========================================");
    console.log("Host: Processing /getTodo request");
    console.log("========================================");

    const url = 'https://jsonplaceholder.typicode.com/todos/1';

    // Fetch todo data with TLS information
    const todoWithTLS = await fetchTodoWithTLS(url);

    // Validate with enclave
    const tlsValidated = await validateWithEnclave(todoWithTLS);

    // Respond to client
    const response = {
      todo: todoWithTLS.data,
      tlsValidated: tlsValidated
    };

    console.log("✓ Sending response to client");
    res.json(response);

  } catch (error) {
    console.error("✗ Error processing request:", error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      todo: null,
      tlsValidated: false
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ Express server running on port ${PORT}`);
  console.log(`✓ GET /getTodo - Fetch todo with TLS validation`);
  console.log(`✓ GET /health - Health check`);
  console.log("========================================");
}); 