const fs = require('fs');
const crypto = require('crypto');

console.log("--------------------------------");
console.log("Enclave: Processing API data...");
console.log("--------------------------------");

// Certificate pinning - Expected certificate fingerprints for jsonplaceholder.typicode.com
// These would be updated when the certificate rotates
const PINNED_CERTIFICATES = {
  'jsonplaceholder.typicode.com': {
    // Multiple fingerprints can be pinned for certificate rotation
    allowedFingerprints: [
      // Add the actual fingerprint(s) here - this is just an example format
      // 'SHA256:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
    ],
    // Alternative: Pin the public key hash (more resilient to certificate rotation)
    allowedPublicKeyHashes: [
      'SHA256:32:1E:EE:7E:BE:98:7A:97:70:BF:82:06:9C:C1:42:25:C5:46:F4:FD:18:78:8A:B3:68:CA:FE:7A:E2:68:D3:F5'
    ],
    // Pin specific certificate authorities
    allowedIssuers: [
      // 'C=US\nO=Google Trust Services\nCN=WE1',
      // 'CN=R3,O=Let\'s Encrypt,C=US',
      // 'CN=R10,O=Let\'s Encrypt,C=US',
      // Add other trusted issuers for this domain
    ]
  }
};

// Function to verify TLS certificate with pinning
function verifyTLSCertificate(certData, hostname, expectedUrl) {
  try {
    console.log("Enclave: Verifying TLS certificate...");
    console.log("Enclave: Expected URL:", expectedUrl);
    console.log("Enclave: Hostname:", hostname);

    // Convert base64 certificate to PEM format
    let certPem;
    if (certData.certificate) {
      const certBase64 = certData.certificate;
      certPem = `-----BEGIN CERTIFICATE-----\n${certBase64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
    } else {
      throw new Error("No certificate data provided");
    }

    // Parse the certificate
    const cert = new crypto.X509Certificate(certPem);

    // 1. Basic certificate validation
    const now = new Date();
    const notBefore = new Date(cert.validFrom);
    const notAfter = new Date(cert.validTo);

    if (now < notBefore || now > notAfter) {
      throw new Error(`Certificate is not valid for current time. Valid from ${cert.validFrom} to ${cert.validTo}`);
    }

    // 2. Hostname verification
    if (!cert.checkHost(hostname)) {
      throw new Error(`Certificate does not match hostname: ${hostname}`);
    }

    // 3. Certificate Pinning Verification
    const pinnedConfig = PINNED_CERTIFICATES[hostname];
    if (pinnedConfig) {
      console.log("Enclave: Performing certificate pinning verification...");

      let pinningPassed = false;

      // Check fingerprint pinning
      if (pinnedConfig.allowedFingerprints && pinnedConfig.allowedFingerprints.length > 0) {
        const certFingerprint = cert.fingerprint;
        if (pinnedConfig.allowedFingerprints.includes(certFingerprint)) {
          console.log("Enclave: Certificate fingerprint matches pinned value");
          pinningPassed = true;
        } else {
          console.log("Enclave: Certificate fingerprint does not match any pinned values");
          console.log("  Received:", certFingerprint);
          console.log("  Expected one of:", pinnedConfig.allowedFingerprints);
        }
      }

      // Check public key pinning
      if (!pinningPassed && pinnedConfig.allowedPublicKeyHashes && pinnedConfig.allowedPublicKeyHashes.length > 0) {
        const publicKeyDer = cert.publicKey.export({ format: 'der', type: 'spki' });
        const publicKeyHash = 'SHA256:' + crypto.createHash('sha256').update(publicKeyDer).digest('hex').toUpperCase().match(/.{2}/g).join(':');

        if (pinnedConfig.allowedPublicKeyHashes.includes(publicKeyHash)) {
          console.log("Enclave: Public key hash matches pinned value");
          pinningPassed = true;
        } else {
          console.log("Enclave: Public key hash does not match any pinned values");
          console.log("  Received:", publicKeyHash);
          console.log("  Expected one of:", pinnedConfig.allowedPublicKeyHashes);
        }
      }

      // Check issuer pinning
      if (!pinningPassed && pinnedConfig.allowedIssuers && pinnedConfig.allowedIssuers.length > 0) {
        if (pinnedConfig.allowedIssuers.includes(cert.issuer)) {
          console.log("Enclave: Certificate issuer matches pinned value");
          pinningPassed = true;
        } else {
          console.log("Enclave: Certificate issuer does not match any pinned values");
          console.log("  Received:", cert.issuer);
          console.log("  Expected one of:", pinnedConfig.allowedIssuers);
        }
      }

      if (!pinningPassed) {
        throw new Error("Certificate pinning verification failed - certificate not trusted for this domain");
      }
    } else {
      console.log("Enclave: Warning - No certificate pinning configured for", hostname);
    }

    // 4. URL consistency check
    if (expectedUrl) {
      const urlObj = new URL(expectedUrl);
      if (urlObj.hostname !== hostname) {
        throw new Error(`URL hostname mismatch: expected ${urlObj.hostname}, got ${hostname}`);
      }
    }

    // 5. Additional security checks
    // Check for weak signature algorithms
    const signatureAlgorithm = cert.fingerprint.split(':')[0]; // This is a simplified check
    if (signatureAlgorithm === 'SHA1') {
      throw new Error("Certificate uses weak SHA1 signature algorithm");
    }

    // Display certificate information
    console.log("Enclave: Certificate verification successful!");
    console.log("  Subject:", cert.subject);
    console.log("  Issuer:", cert.issuer);
    console.log("  Valid from:", cert.validFrom);
    console.log("  Valid to:", cert.validTo);
    console.log("  Serial number:", cert.serialNumber);
    console.log("  Fingerprint:", cert.fingerprint);

    // Cross-verify with captured metadata
    if (certData.subject && cert.subject !== certData.subject) {
      console.log("  Warning: Subject mismatch between captured and parsed certificate");
    }
    if (certData.fingerprint && cert.fingerprint !== certData.fingerprint) {
      console.log("  Warning: Fingerprint mismatch between captured and parsed certificate");
    }

    return true;

  } catch (error) {
    console.error("Enclave: Certificate verification failed:", error.message);
    return false;
  }
}

try {
  // Read the API data that was fetched by the host
  const apiDataRaw = fs.readFileSync('api_data.json', 'utf8');
  const responseData = JSON.parse(apiDataRaw);

  console.log("Enclave: API data received and parsed successfully!");

  // Verify TLS certificate if provided
  if (responseData.tlsCertificate) {
    console.log("--------------------------------");
    const expectedUrl = responseData.source || 'https://jsonplaceholder.typicode.com/todos/1';
    const certValid = verifyTLSCertificate(
      responseData.tlsCertificate,
      'jsonplaceholder.typicode.com',
      expectedUrl
    );

    if (!certValid) {
      console.error("Enclave: TLS certificate verification failed - data may not be trustworthy!");
      console.log("--------------------------------");
      process.exit(1);
    }
    console.log("--------------------------------");
  } else {
    console.log("Enclave: Warning - No TLS certificate data provided for verification");
    console.log("--------------------------------");
  }

  // Process the actual API data
  const todoData = responseData.data || responseData;
  console.log("Enclave: Todo Details:");
  console.log("  User ID:", todoData.userId);
  console.log("  Todo ID:", todoData.id);
  console.log("  Title:", todoData.title);
  console.log("  Completed:", todoData.completed);
  console.log("--------------------------------");
  console.log("Enclave: Raw JSON Data:");
  console.log(JSON.stringify(todoData, null, 2));
  console.log("--------------------------------");
  console.log("Enclave: Data processing completed successfully!");

} catch (error) {
  if (error.code === 'ENOENT') {
    console.error("Enclave: Error - API data file not found. Make sure to run fetch_and_run.js first.");
  } else {
    console.error("Enclave: Error processing API data:", error.message);
  }
  console.log("--------------------------------");
}
