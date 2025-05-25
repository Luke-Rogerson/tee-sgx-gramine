const fs = require('fs');
const crypto = require('crypto');

console.log("========================================");
console.log("Enclave: Secure data processing");
console.log("========================================");

// Certificate pinning configuration
const PINNED_CERTIFICATES = {
  'jsonplaceholder.typicode.com': {
    allowedPublicKeyHashes: [
      'SHA256:32:1E:EE:7E:BE:98:7A:97:70:BF:82:06:9C:C1:42:25:C5:46:F4:FD:18:78:8A:B3:68:CA:FE:7A:E2:68:D3:F5'
    ],
    allowedIssuers: [
      // Add trusted issuers here when needed
    ]
  }
};

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

    // Basic certificate validation
    const now = new Date();
    const notBefore = new Date(cert.validFrom);
    const notAfter = new Date(cert.validTo);

    if (now < notBefore || now > notAfter) {
      throw new Error(`Certificate expired or not yet valid`);
    }

    // Hostname verification
    if (!cert.checkHost(hostname)) {
      throw new Error(`Certificate does not match hostname: ${hostname}`);
    }

    // Certificate pinning verification
    const pinnedConfig = PINNED_CERTIFICATES[hostname];
    if (pinnedConfig && pinnedConfig.allowedPublicKeyHashes.length > 0) {
      const publicKeyDer = cert.publicKey.export({ format: 'der', type: 'spki' });
      const publicKeyHash = 'SHA256:' + crypto.createHash('sha256').update(publicKeyDer).digest('hex').toUpperCase().match(/.{2}/g).join(':');

      if (!pinnedConfig.allowedPublicKeyHashes.includes(publicKeyHash)) {
        console.log("  Received:", publicKeyHash);
        console.log("  Expected:", pinnedConfig.allowedPublicKeyHashes);
        throw new Error("Certificate pinning verification failed");
      }
      console.log("✓ Certificate pinning verification passed");
    }

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

try {
  // Read data from host
  const apiDataRaw = fs.readFileSync('api_data.json', 'utf8');
  const responseData = JSON.parse(apiDataRaw);

  console.log("✓ Data received from host");

  // Verify TLS certificate if provided
  if (responseData.tlsCertificate) {
    const certValid = verifyTLSCertificate(
      responseData.tlsCertificate,
      'jsonplaceholder.typicode.com',
      responseData.source
    );

    if (!certValid) {
      console.error("✗ Certificate verification failed - data not trustworthy!");
      process.exit(1);
    }
  } else {
    console.log("⚠ Warning: No certificate data provided");
  }

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

} catch (error) {
  if (error.code === 'ENOENT') {
    console.error("✗ No data file found. Run host.js first.");
  } else {
    console.error("✗ Error:", error.message);
  }
  process.exit(1);
} 