const defaultConfig = require("./default");

module.exports = {
    ...defaultConfig,
    database: {
        uri: "mongodb://localhost:27017/mpesa_connect_dev"
    }
};
