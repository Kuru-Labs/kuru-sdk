import MarketListener from '../src/listener/marketsListener';

const rpcUrl = 'http://localhost:8545';
const contractAddress = '0x3049C306C7d59cDc4925a083DA32C2870f5b9d0e';

const dbConfig = {
    user: 'username',
    host: 'localhost', // or the database server's address
    database: 'orderbook',
    password: 'password',
    port: 5432,
};


const sdk = new MarketListener(rpcUrl, contractAddress, dbConfig);

// Start listening for events
sdk.listenForOrderEvents();
