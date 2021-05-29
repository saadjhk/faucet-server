require('dotenv').config();
import express from 'express';
import * as winston from 'winston';
import * as expressWinston from 'express-winston';
import cors from 'cors';

import { ethers } from 'ethers';
import rateLimit from "express-rate-limit";
import { JHKToken__factory } from './contracts/factories/JHKToken__factory';
import { JHKToken } from './contracts/JHKToken';

const app: express.Application = express();

const ethersProvider = new ethers.providers.JsonRpcProvider(process.env.GETH_URL);
const ethersWallet = new ethers.Wallet(process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY : ``, ethersProvider);
const jhkToken = JHKToken__factory.connect(process.env.USDC ? process.env.USDC : ``, ethersWallet);


type SentData = {
    [tokenName: string]: number;
};

type SentMemory = {
    [address: string]: SentData;
}
const sentMemory: SentMemory = {};


function getLastSentTimeStamp(address: string, tokenName: string): undefined | number {
    if (sentMemory[address][tokenName]) {
        return sentMemory[address][tokenName];
    } else {
        return undefined;
    }
}

function setLastSentTimeStamp(address: string, token: string) {
    if (sentMemory[address]) {
        sentMemory[address] = {
            ... sentMemory[address],
            [token]: Date.now()
        } 
    } else {
        sentMemory[address] = {
            [token]: Date.now()
        }
    }
}

// here we are adding middleware to allow cross-origin requests
app.use(cors({
    origin: '*',
    methods: ['POST','OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'X-Access-Token'],
    credentials: true
}));

const supportedTokens = {
    'ETH': {
        faucetAmount: `0x1312D00`,
        contract: undefined        
    },
    'USDC': {
        faucetAmount: `0x1312D00`,
        contract: jhkToken
    }
};

function getContract(tokenName: string): { contract: JHKToken, faucetAmount: string } | undefined {
    switch(tokenName) {
        case 'USDC':
            return supportedTokens.USDC;
        default:
            return undefined;
    }
}

// const limiter = rateLimit({
//     windowMs: 24 * 60 * 60 * 1000
//     max: 2
// });
// app.use(limiter);

// here we are adding middleware to parse all incoming requests as JSON 
app.use(express.json());

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
    const lastSent = getLastSentTimeStamp(req.params.address, req.params.token);
    if (!lastSent || lastSent <= Date.now() - 24 * 60 * 60 * 1000) {
        setLastSentTimeStamp(req.params.address, req.params.token);
        if (req.params.token in supportedTokens) {
            if (req.params.address && /^0x[a-fA-F0-9]{40}$/.test(req.params.address)) {
                if (req.params.token === 'ETH') {
                    let tx = await ethersWallet.sendTransaction({
                        to: req.params.address,
                        value: ethers.utils.parseEther("1.0")
                    });
                    res.send(`Sent ${1.0} ${req.params.token} TX hash: ${tx.hash}.`);
                } else {
                    let token = getContract(req.params.token);
                    if (token) {
                        await token.contract.transfer(req.params.address, token.faucetAmount);
                        res.send(`Sent ${20} ${req.params.token}.`);
                    } else {
                        res.send(`Unsupported token ${req.params.token}.`);
                    }
                }
            } else {
                res.send(`Invalid address`);
            }
        } else {
            res.send(`Unsupported token ${req.params.token}.`);
        }
    } else {
        res.send(`Have already recieved tokens in last 24`);
    }
});


// this is a simple route to make sure everything is working properly
const runningMessage = `🚰 Server running at http://localhost:${process.env.PORT}`;
app.get('/', (req: express.Request, res: express.Response) => {
    res.status(200).send(runningMessage)
});


app.listen(process.env.PORT, () => console.log(runningMessage))