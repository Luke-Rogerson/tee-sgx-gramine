const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

console.log("========================================");
console.log("Demo: Fetching API data and running enclave");
console.log("========================================");

// Step 1: Make network call on host
console.log("Step 1: Making network call to JSONPlaceholder API...");
const url = 'https://jsonplaceholder.typicode.com/todos/1';

https.get(url, (response) => {
  let data = '';

  response.on('data', (chunk) => {
    data += chunk;
  });

  response.on('end', () => {
    try {
      const todoData = JSON.parse(data);
      console.log("✓ API data fetched successfully");

      // Step 2: Save data to file
      console.log("Step 2: Saving data for enclave...");
      fs.writeFileSync('api_data.json', JSON.stringify(todoData, null, 2));
      console.log("✓ Data saved to api_data.json");

      // Step 3: Build and run enclave
      console.log("Step 3: Building and running enclave...");
      console.log("========================================");

      try {
        // Build the manifest
        execSync('make SGX=1', { stdio: 'inherit' });

        // Run the enclave
        execSync('gramine-sgx ./nodejs helloworld.js', { stdio: 'inherit' });

      } catch (error) {
        console.error("Error running enclave:", error.message);
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
      console.error("Error parsing API response:", error.message);
    }
  });

}).on('error', (error) => {
  console.error("Network request failed:", error.message);
}); 