const crypto = require('crypto');
const net = require('net');
const secp256k1 = require('secp256k1');

console.log("========================================");
console.log("Enclave: Starting secure price validation server");
console.log("========================================");

const TCP_PORT = 8080;
const TCP_HOST = '127.0.0.1';

// Generate fresh ECDSA key pair on startup
let privateKey, publicKey;

function generateKeyPair() {
  console.log("Enclave: Generating fresh ECDSA key pair...");

  // Generate a random private key
  do {
    privateKey = crypto.randomBytes(32);
  } while (!secp256k1.privateKeyVerify(privateKey));

  // Derive the public key
  publicKey = secp256k1.publicKeyCreate(privateKey);

  console.log("✓ Key pair generated successfully");
  console.log("  Public Key (hex):", Buffer.from(publicKey).toString('hex'));
  console.log("  Public Key (compressed):", secp256k1.publicKeyConvert(publicKey, true).toString('hex'));
}

function verifyBinanceTLSCertificate(certData, hostname) {
  try {
    console.log("Enclave: Verifying Binance TLS certificate...");

    if (!certData.certificate) {
      throw new Error("No certificate data provided");
    }

    // Convert base64 certificate to PEM format
    const certBase64 = certData.certificate;
    const certPem = `-----BEGIN CERTIFICATE-----\n${certBase64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
    const cert = new crypto.X509Certificate(certPem);

    // Verify the certificate is for the expected hostname
    if (!cert.checkHost(hostname)) {
      throw new Error(`Certificate hostname verification failed for ${hostname}`);
    }

    // Check certificate validity period
    const now = new Date();
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);

    if (now < validFrom || now > validTo) {
      throw new Error("Certificate is not within valid time period");
    }

    console.log("✓ Certificate verification successful");
    console.log("  Subject:", cert.subject);
    console.log("  Issuer:", cert.issuer);
    console.log("  Valid until:", cert.validTo);

    return true;

  } catch (error) {
    console.error("✗ Certificate verification failed:", error.message);
    return false;
  }
}

function signPriceData(priceData) {
  try {
    console.log("Enclave: Signing price data...");

    // Create message to sign: symbol|price|timestamp
    const message = `${priceData.symbol}|${priceData.price}|${priceData.timestamp}`;
    const messageHash = crypto.createHash('sha256').update(message).digest();

    // Sign the hash
    const signature = secp256k1.ecdsaSign(messageHash, privateKey);

    console.log("✓ Price data signed successfully");
    console.log("  Message:", message);
    console.log("  Signature (hex):", Buffer.from(signature.signature).toString('hex'));

    return {
      signature: Buffer.from(signature.signature).toString('hex'),
      recovery: signature.recovery,
      messageHash: messageHash.toString('hex'),
      publicKey: Buffer.from(publicKey).toString('hex')
    };

  } catch (error) {
    console.error("✗ Error signing price data:", error.message);
    throw error;
  }
}

// Create TCP server
const server = net.createServer((socket) => {
  console.log("✓ New price validation request received");

  let data = '';

  socket.on('data', (chunk) => {
    data += chunk.toString();
  });

  socket.on('end', () => {
    try {
      // Parse the request data
      const requestData = JSON.parse(data);
      console.log("✓ Data received from host via TCP");

      let validationResult = { success: false, error: null };

      if (requestData.type === 'getPublicKey') {
        // Return public key
        validationResult = {
          success: true,
          publicKey: Buffer.from(publicKey).toString('hex'),
          publicKeyCompressed: secp256k1.publicKeyConvert(publicKey, true).toString('hex')
        };
      } else if (requestData.type === 'validateAndSign' && requestData.tlsCertificate && requestData.priceData) {
        console.log("✓ Received price data in enclave:", JSON.stringify(requestData.priceData, null, 2));

        // Verify TLS certificate
        const certValid = verifyBinanceTLSCertificate(
          requestData.tlsCertificate,
          'api.binance.us'
        );

        if (certValid) {
          // Sign the price data
          const signatureData = signPriceData(requestData.priceData);

          console.log("========================================");
          console.log("Enclave: Processing verified price data");
          console.log("========================================");
          console.log("Price Details:");
          console.log("  Symbol:", requestData.priceData.symbol);
          console.log("  Price:", requestData.priceData.price);
          console.log("  Timestamp:", requestData.priceData.timestamp);
          console.log("========================================");
          console.log("✓ Secure processing completed successfully!");

          validationResult = {
            success: true,
            signedPrice: {
              ...requestData.priceData,
              ...signatureData
            }
          };
        } else {
          validationResult = { success: false, error: "Certificate verification failed" };
        }
      } else {
        validationResult = { success: false, error: "Invalid request format" };
      }

      // Send response back to host
      socket.write(JSON.stringify(validationResult));
      socket.end();

    } catch (error) {
      console.error("✗ Error processing data:", error.message);
      const errorResponse = { success: false, error: error.message };
      socket.write(JSON.stringify(errorResponse));
      socket.end();
    }
  });

  socket.on('error', (error) => {
    console.error("✗ Socket error:", error.message);
  });
});

// Generate key pair on startup
generateKeyPair();

// Start the TCP server
server.listen(TCP_PORT, TCP_HOST, () => {
  console.log(`✓ Enclave price validation server listening on ${TCP_HOST}:${TCP_PORT}`);
  console.log("✓ Ready to process price validation and signing requests");
  console.log("========================================");
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log("\n========================================");
  console.log("Enclave: Shutting down gracefully...");
  console.log("========================================");
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log("\n========================================");
  console.log("Enclave: Received SIGTERM, shutting down...");
  console.log("========================================");
  server.close(() => {
    process.exit(0);
  });
}); 