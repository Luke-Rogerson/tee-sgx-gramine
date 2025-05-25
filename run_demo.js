const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

console.log("========================================");
console.log("Demo: Building enclave and fetching API data");
console.log("========================================");

// Step 1: Build the enclave first
console.log("Step 1: Building SGX enclave...");
try {
  execSync('make SGX=1', { stdio: 'inherit' });
  console.log("✓ Enclave built successfully");
} catch (error) {
  console.error("✗ Failed to build enclave:", error.message);
  process.exit(1);
}

// Step 2: Make network call on host with TLS certificate capture
console.log("Step 2: Making network call to JSONPlaceholder API...");
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

      // Step 3: Save data to file
      console.log("Step 3: Saving data and certificate for enclave...");
      fs.writeFileSync('api_data.json', JSON.stringify(responseWithCert, null, 2));
      console.log("✓ Data and certificate saved to api_data.json");

      // Step 4: Run the enclave
      console.log("Step 4: Running enclave with API data and certificate...");
      console.log("========================================");

      try {
        execSync('gramine-sgx ./nodejs helloworld.js', { stdio: 'inherit' });
        console.log("========================================");
        console.log("✓ Enclave execution completed successfully");

      } catch (error) {
        console.error("✗ Error running enclave:", error.message);
      } finally {
        // Clean up
        if (fs.existsSync('api_data.json')) {
          fs.unlinkSync('api_data.json');
          console.log("✓ Cleaned up temporary files");
        }
      }

      console.log("========================================");
      console.log("Demo completed!");

    } catch (error) {
      console.error("✗ Error parsing API response:", error.message);
    }
  });

});

request.on('error', (error) => {
  console.error("✗ Network request failed:", error.message);
});

// Handle TLS errors specifically
request.on('tlsClientError', (error) => {
  console.error("✗ TLS error:", error.message);
}); 