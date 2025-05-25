const https = require('https');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

console.log("================================");
console.log("Host: Building enclave...");
console.log("================================");

// Step 1: Build the enclave first
try {
  execSync('make SGX=1', { stdio: 'inherit' });
  console.log("Host: Enclave built successfully");
} catch (error) {
  console.error("Host: Failed to build enclave:", error.message);
  process.exit(1);
}

console.log("================================");
console.log("Host: Fetching data from API...");
console.log("================================");

// Step 2: Make a GET request to the JSONPlaceholder API on the host
const url = 'https://jsonplaceholder.typicode.com/todos/1';

const request = https.get(url, (response) => {
  let data = '';

  // Capture TLS certificate information
  const socket = response.socket;
  const cert = socket.getPeerCertificate(true);
  const certChain = socket.getPeerCertificateChain ? socket.getPeerCertificateChain() : [];

  console.log("Host: TLS connection established and certificate captured");

  // Collect data chunks
  response.on('data', (chunk) => {
    data += chunk;
  });

  // Handle the complete response
  response.on('end', () => {
    try {
      const todoData = JSON.parse(data);
      console.log("Host: API data fetched successfully");
      console.log("Host: Passing data and certificate to enclave...");

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

      // Write the data to a temporary file that the enclave can read
      fs.writeFileSync('api_data.json', JSON.stringify(responseWithCert, null, 2));

      // Run the enclave with the data
      const gramine = spawn('gramine-sgx', ['./nodejs', 'helloworld.js'], {
        stdio: 'inherit'
      });

      gramine.on('close', (code) => {
        // Clean up the temporary file
        fs.unlinkSync('api_data.json');
        console.log("================================");
        console.log(`Host: Enclave execution completed with code ${code}`);
      });

    } catch (error) {
      console.error("Host: Error parsing JSON response:", error.message);
    }
  });

});

request.on('error', (error) => {
  console.error("Host: Network request failed:", error.message);
});

// Handle TLS errors specifically
request.on('tlsClientError', (error) => {
  console.error("Host: TLS error:", error.message);
}); 