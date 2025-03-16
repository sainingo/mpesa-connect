module.exports = {
    app: {
        name: "mpesa-connect",
        port: process.env.PORT || 3000
    },
    mpesa: {
        baseUrl: "https://sandbox.safaricom.co.ke",
        consumerKey: process.env.MPESA_CONSUMER_KEY,
        consumerSecret: process.env.MPESA_CONSUMER_SECRET,
        passkey: process.env.MPESA_PASSKEY,
        shortCode: process.env.MPESA_SHORTCODE
    },
    database: {
        uri: process.env.MONGO_URI || "mongodb://localhost:27017/mpesa_connect"
    },
    jwt: {
        secret: process.env.JWT_SECRET || "supersecret",
        expiresIn: "1h"
    },
    logging: {
        level: process.env.LOG_LEVEL || "info"
    }
};
