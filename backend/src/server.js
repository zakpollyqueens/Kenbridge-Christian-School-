const express = require('express');
const app = express();

// ... your middleware and routes ...

// Dynamically bind to Render's assigned port, defaulting to 5000 locally
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kenbridge backend running on port ${PORT}`);
});
