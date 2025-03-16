# MPESA Connect

[![npm version](https://img.shields.io/npm/v/mpesa-connect.svg)](https://www.npmjs.com/package/mpesa-connect)
[![License](https://img.shields.io/npm/l/mpesa-connect.svg)](https://github.com/yourusername/mpesa-connect/blob/main/LICENSE)
[![Build Status](https://img.shields.io/travis/yourusername/mpesa-connect.svg)](https://travis-ci.org/yourusername/mpesa-connect)

A powerful, developer-friendly middleware for Safaricom's MPESA payment APIs. MPESA Connect provides a simplified interface to integrate mobile payments into your applications without the complexity of dealing with the raw MPESA APIs.

## 🚀 Features

- **Simplified API Integration**: Clean, RESTful endpoints for all MPESA operations
- **Authentication Handling**: Automatic OAuth token management
- **Comprehensive Coverage**: Support for STK Push, C2B, B2C, and more
- **Robust Error Handling**: Detailed error messages and logging
- **TypeScript Support**: Full type definitions for better developer experience
- **Webhook Management**: Easy configuration of callback URLs and processing
- **Transaction Tracking**: Built-in transaction status tracking
- **Flexible Deployment**: Use as a standalone service or npm package

## 📦 Installation

<!-- ### As an npm package

```bash
npm install mpesa-connect
``` -->

### As a standalone service

```bash
# Clone the repository
git clone https://github.com/sainingo/mpesa-connect.git

# Install dependencies
cd mpesa-connect
npm install

# Configure environment variables
cp .env.example .env

# Start the server
npm start
```

## ⚙️ Configuration

Create a `.env` file with the following variables:

```
# Server Configuration
PORT=3000
HOST=localhost
NODE_ENV=development

# MPESA API Configuration
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORT_CODE=your_shortcode
MPESA_ENVIRONMENT=sandbox  # or production

# Database Configuration (if applicable)
MONGODB_URI=mongodb://localhost:27017/mpesa-connect

# Security
JWT_SECRET=your_jwt_secret
```

## 🔧 Usage

<!-- ### As an npm package

```javascript
// Initialize the client
const { MpesaConnect } = require('mpesa-connect');

const mpesa = new MpesaConnect({
  consumerKey: 'your_consumer_key',
  consumerSecret: 'your_consumer_secret',
  shortCode: 'your_shortcode',
  passkey: 'your_passkey',
  environment: 'sandbox' // or 'production'
});

// STK Push Example
async function initiatePayment() {
  try {
    const result = await mpesa.stkPush({
      amount: 1,
      phoneNumber: '254712345678',
      accountReference: 'Test',
      transactionDesc: 'Test Payment'
    });
    
    console.log('Payment initiated:', result);
  } catch (error) {
    console.error('Payment failed:', error);
  }
}

// C2B Registration Example
async function registerUrls() {
  try {
    const result = await mpesa.c2b.registerUrls({
      ValidationURL: 'https://example.com/validation',
      ConfirmationURL: 'https://example.com/confirmation',
      ResponseType: 'Completed'
    });
    
    console.log('URLs registered:', result);
  } catch (error) {
    console.error('Registration failed:', error);
  }
}
``` -->

### As a standalone service

#### STK Push

```bash
curl -X POST http://localhost:3000/api/v1/stk/push \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{
    "phoneNumber": "254712345678",
    "amount": 1,
    "accountReference": "Test",
    "transactionDesc": "Test Payment"
  }'
```

#### B2C Payment

```bash
curl -X POST http://localhost:3000/api/v1/b2c/payment \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{
    "phoneNumber": "254712345678",
    "amount": 1,
    "occasion": "Promotion",
    "remarks": "Promotion payment"
  }'
```

## 🔄 API Reference

### STK Push

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/stk/push` | POST | Initiate STK Push prompt |
| `/api/v1/stk/query` | POST | Query STK Push transaction status |

### C2B

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/c2b/register` | POST | Register validation and confirmation URLs |
| `/api/v1/c2b/simulate` | POST | Simulate C2B transaction (sandbox only) |

### B2C

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/b2c/payment` | POST | Send money to customer |
| `/api/v1/b2c/status` | POST | Query B2C transaction status |

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/token` | GET | Get OAuth token (for testing) |
| `/api/v1/auth/register` | POST | Register API user |
| `/api/v1/auth/login` | POST | Login to get API key |

## 📚 Webhook Handling

MPESA Connect automatically processes incoming webhooks. Set up your callback URLs using the C2B registration endpoint, and implement handlers for incoming notifications:

```javascript
// When using as an npm package
mpesa.on('payment.received', (payment) => {
  console.log('Payment received:', payment);
  // Update your database, notify your user, etc.
});

mpesa.on('payment.failed', (error) => {
  console.error('Payment failed:', error);
  // Handle the failure
});
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- [Safaricom Developer Portal](https://developer.safaricom.co.ke/)
- [Hapi.js](https://hapi.dev/) - The framework used
- Contributors who have helped improve this project

---

Built with ❤️ by Kantush