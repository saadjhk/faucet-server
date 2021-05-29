import express from 'express';

import * as winston from 'winston';
import * as expressWinston from 'express-winston';
import cors from 'cors';

import { ethers } from 'ethers';
import { JHKToken__factory } from './contracts/factories/JHKToken__factory';
import { JHKToken } from './contracts/JHKToken';

const app: express.Application = express();
const port = 7500;


const ethersProvider = new ethers.providers.JsonRpcProvider(``);
const ethersWallet = new ethers.Wallet(``, ethersProvider);
const jhkToken = JHKToken__factory.connect(`0x18bdb6986a38998f4c4a5b4ac81f13092ea45004`, ethersWallet);

const supportedTokens = {
    'ETH': {
        faucetAmount: ethers.utils.parseEther("1.0"),
        contract: undefined        
    },
    'USDC': {
        faucetAmount: `0x1312D00`,
        contract: jhkToken
    }
};

function getContract(tokenName: string): JHKToken | undefined {
    switch(tokenName) {
        case 'USDC':
            return supportedTokens.USDC.contract;
        default:
            return undefined;
    }
}

// here we are adding middleware to parse all incoming requests as JSON 
app.use(express.json());

// here we are adding middleware to allow cross-origin requests
app.use(cors());

// here we are preparing the expressWinston logging middleware configuration,
// which will automatically log all HTTP requests handled by Express.js
const loggerOptions: expressWinston.LoggerOptions = {
    transports: [new winston.transports.Console()],
    format: winston.format.combine(
        winston.format.json(),
        winston.format.prettyPrint(),
        winston.format.colorize({ all: true })
    ),
};

if (!process.env.DEBUG) {
    loggerOptions.meta = false; // when not debugging, log requests as one-liners
}

// initialize the logger with the above configuration
app.use(expressWinston.logger(loggerOptions));

// here we are adding the UserRoutes to our array,
// after sending the Express.js application object to have the routes added to our app!


app.post('/faucet/:token/:address', async (req, res) => {
    if(req.params.token in supportedTokens) {
        if (req.params.address && /^0x[a-fA-F0-9]{40}$/.test(req.params.address)) {
            if (req.params.token === 'ETH') {
                let tx = await ethersWallet.sendTransaction({
                    to: req.params.address,
                    value: ethers.utils.parseEther("1.0")
                });
                res.send(`Sent ${1.0} ${req.params.token} TX hash: ${tx.hash}.`);
            } else {
                let contract = getContract(req.params.token);
                if (contract) {
                    await contract.transfer(req.params.address, '20000000');
                    res.send(`Sent ${20} ${req.params.token}.`);
                } else {
                    res.send(`Unsupported token ${req.params.token}.`);
                }
            }
        } else {
            res.send(`Invalid address`);
        }
    } else {
        res.send(`Error`);
    }
});


// this is a simple route to make sure everything is working properly
const runningMessage = `Server running at http://localhost:${port}`;
app.get('/', (req: express.Request, res: express.Response) => {
    res.status(200).send(runningMessage)
});


app.listen(port, () => console.log(runningMessage))