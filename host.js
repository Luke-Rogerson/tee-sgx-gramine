const https = require('https');
const fs = require('fs');

console.log("========================================");
console.log("Host: Fetching API data and certificate");
console.log("========================================");

const url = 'https://jsonplaceholder.typicode.com/todos/1';

const request = https.get(url, (response) => {
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
          certificate: cert.raw ? cert.raw.toString('base64') : null,
          certificateChain: certChain.map(c => c.raw ? c.raw.toString('base64') : null),
          subject: cert.subject,
          issuer: cert.issuer,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          fingerprint: cert.fingerprint,
          serialNumber: cert.serialNumber
        },
        timestamp: new Date().toISOString(),
        source: url
      };

      // Save data for enclave
      fs.writeFileSync('api_data.json', JSON.stringify(responseWithCert, null, 2));
      console.log("✓ Data and certificate saved to api_data.json");
      console.log("✓ Ready for enclave processing");

    } catch (error) {
      console.error("✗ Error parsing API response:", error.message);
      process.exit(1);
    }
  });
});

request.on('error', (error) => {
  console.error("✗ Network request failed:", error.message);
  process.exit(1);
});

request.on('tlsClientError', (error) => {
  console.error("✗ TLS error:", error.message);
  process.exit(1);
}); 