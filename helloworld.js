const fs = require('fs');

console.log("--------------------------------");
console.log("Enclave: Processing API data...");
console.log("--------------------------------");

try {
  // Read the API data that was fetched by the host
  const apiDataRaw = fs.readFileSync('api_data.json', 'utf8');
  const todoData = JSON.parse(apiDataRaw);

  console.log("Enclave: API data received and parsed successfully!");
  console.log("--------------------------------");
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
