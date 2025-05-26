const crypto = require('crypto');
const net = require('net');

console.log("========================================");
console.log("Enclave: Starting secure validation server");
console.log("========================================");

const TCP_PORT = 8080;
const TCP_HOST = '127.0.0.1';
const PUBLIC_KEY_HASH = 'SHA256:32:1E:EE:7E:BE:98:7A:97:70:BF:82:06:9C:C1:42:25:C5:46:F4:FD:18:78:8A:B3:68:CA:FE:7A:E2:68:D3:F5';

function verifyTLSCertificate(certData, hostname, expectedUrl) {
  try {
    console.log("Enclave: Verifying TLS certificate...");

    if (!certData.certificate) {
      throw new Error("No certificate data provided");
    }

    // Convert base64 certificate to PEM format
    const certBase64 = certData.certificate;
    const certPem = `-----BEGIN CERTIFICATE-----\n${certBase64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
    const cert = new crypto.X509Certificate(certPem);

    const publicKeyDer = cert.publicKey.export({ format: 'der', type: 'spki' });
    const publicKeyHash = 'SHA256:' + crypto.createHash('sha256').update(publicKeyDer).digest('hex').toUpperCase().match(/.{2}/g).join(':');



    if (publicKeyHash !== PUBLIC_KEY_HASH) {
      console.log("  Received:", publicKeyHash);
      console.log("  Expected:", PUBLIC_KEY_HASH);
      throw new Error("Certificate pinning verification failed");
    }
    console.log("✓ Certificate pinning verification passed");

    // URL consistency check
    if (expectedUrl) {
      const urlObj = new URL(expectedUrl);
      if (urlObj.hostname !== hostname) {
        throw new Error(`URL hostname mismatch`);
      }
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

// Create TCP server instead of Unix socket
const server = net.createServer((socket) => {
  console.log("✓ New validation request received");

  let data = '';

  socket.on('data', (chunk) => {
    data += chunk.toString();
  });

  socket.on('end', () => {
    try {
      // Parse the request data
      const responseData = JSON.parse(data);
      console.log("✓ Data received from host via TCP");

      // Verify TLS certificate if provided
      let validationResult = { success: false, error: null };

      if (responseData.tlsCertificate) {
        const certValid = verifyTLSCertificate(
          responseData.tlsCertificate,
          'jsonplaceholder.typicode.com',
          responseData.source
        );

        if (certValid) {
          // Process the verified data
          const todoData = responseData.data;
          console.log("========================================");
          console.log("Enclave: Processing verified data");
          console.log("========================================");
          console.log("Todo Details:");
          console.log("  User ID:", todoData.userId);
          console.log("  Todo ID:", todoData.id);
          console.log("  Title:", todoData.title);
          console.log("  Completed:", todoData.completed);
          console.log("========================================");
          console.log("✓ Secure processing completed successfully!");

          validationResult = { success: true, error: null };
        } else {
          validationResult = { success: false, error: "Certificate verification failed" };
        }
      } else {
        validationResult = { success: false, error: "No certificate data provided" };
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

// Start the TCP server
server.listen(TCP_PORT, TCP_HOST, () => {
  console.log(`✓ Enclave validation server listening on ${TCP_HOST}:${TCP_PORT}`);
  console.log("✓ Ready to process validation requests");
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