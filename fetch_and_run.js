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

https.get(url, (response) => {
  let data = '';

  // Collect data chunks
  response.on('data', (chunk) => {
    data += chunk;
  });

  // Handle the complete response
  response.on('end', () => {
    try {
      const todoData = JSON.parse(data);
      console.log("Host: API data fetched successfully");
      console.log("Host: Passing data to enclave...");

      // Write the data to a temporary file that the enclave can read
      fs.writeFileSync('api_data.json', JSON.stringify(todoData, null, 2));

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

}).on('error', (error) => {
  console.error("Host: Network request failed:", error.message);
}); 