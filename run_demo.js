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

// Step 2: Make network call on host
console.log("Step 2: Making network call to JSONPlaceholder API...");
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

      // Step 3: Save data to file
      console.log("Step 3: Saving data for enclave...");
      fs.writeFileSync('api_data.json', JSON.stringify(todoData, null, 2));
      console.log("✓ Data saved to api_data.json");

      // Step 4: Run the enclave
      console.log("Step 4: Running enclave with API data...");
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

}).on('error', (error) => {
  console.error("✗ Network request failed:", error.message);
}); 