require('dotenv').config()
const ethers = require("ethers");
const erc20Abi = require('./abi/erc20.json');
const oracleAbi = require('./abi/oracle.json');
const cron = require('node-cron');

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545'
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ORACLE = process.env.TELLOR_ORACLE;
const TRB_TOKEN = process.env.TRB_TOKEN;


const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider)

const oracleContract = new ethers.Contract(ORACLE, oracleAbi, signer)
const trb = new ethers.Contract(TRB_TOKEN, erc20Abi, signer);


// https://tellor.io/queryidstation/
const queryId = '0x1962cde2f19178fe2bb2229e78a6d386e6406979edc7b9a1966d89d83b3ebf2e'
const queryData = '0x00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000953706f745072696365000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000006777374657468000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000037573640000000000000000000000000000000000000000000000000000000000';


function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}



const stakeTrb = async () => {
    const [trbBal, stakeAmount, stakerInfo, trbAllowance] = await Promise.all([
        trb.balanceOf(signer.address),
        oracleContract.getStakeAmount(),
        oracleContract.getStakerInfo(signer.address),
        trb.allowance(signer.address, ORACLE)
    ]);
    console.log('trbBal', trbBal.toString())
    console.log('stakeAmount', stakeAmount.toString())
    console.log('trbAllowance', trbAllowance.toString())

    const stakedAmount = stakerInfo[1];
    console.log('stakedAmount', stakedAmount.toString());

    if(stakedAmount.gt('0')) {
        console.log('trb already staked')
        return;
    }

    if(trbAllowance.lt(stakeAmount)) {
        const resp = await trb.approve(ORACLE, stakeAmount);
        const receipt = await resp.wait();
        console.log('approval receipt', receipt)
    }

    if(trbBal.gte(stakeAmount)) {
       const resp = await oracleContract.depositStake(stakeAmount);
       const receipt = await resp.wait();
       console.log('receipt stake transaction', receipt);
    } else {
        console.log('insufficient trb');
    }
}



const main = async () => {
    const [trbBal, stakeAmount, stakerInfo] = await Promise.all([
        trb.balanceOf(signer.address),
        oracleContract.getStakeAmount(),
        oracleContract.getStakerInfo(signer.address)
    ]);
    
    const stakedAmount = stakerInfo[1];

    if(!stakedAmount.gt('0')) {
        console.log('staked amount insufficient!')
        return;
    }

    fetch('https://api.coingecko.com/api/v3/simple/price?ids=wrapped-steth&vs_currencies=usd&precision=6')
        .then((resp) => resp.json()
            .then((jr) => {
                const price = jr['wrapped-steth'].usd;
                console.log('price', price, typeof price);
                const priceInWei = ethers.utils.parseUnits(price.toString(), 6); 
                console.log('in wei', priceInWei.toString())
                const hexVal = ethers.utils.hexZeroPad(ethers.utils.hexlify(priceInWei), 32); 
                console.log('hex', hexVal)

                const nonce = getRandomInt(0, 9999);
                
                // reporting
                oracleContract.submitValue(queryId, hexVal, nonce, queryData)
                    .then((resp) => {
                        resp.wait()
                            .then((reciept) => console.log('transaction receipt', reciept))
                            .catch((err) => console.log('receipt error', err));
                    })
                    .catch((err) => console.log('transaction err', err));
            })
            .catch((e) => console.log(e))
        ).catch((er) => console.log(er));
}


// stakeTrb()

cron.schedule('* * * * *', () => {
    console.log('running a task every hour');
    main();
});