import { JsonRpcProvider, Contract } from 'ethers';

async function main() {
  const rpcUrl = 'https://coston2-api.flare.network/ext/C/rpc';
  const provider = new JsonRpcProvider(rpcUrl);
  const txHash = '0xbc5b04da480320eac2d7d8cba7971e33ac8423fad58a1e3db044727f5aa37cfe';
  
  console.log('Fetching transaction receipt for:', txHash);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    console.log('Transaction receipt not found. It might have been dropped or the RPC is lagging.');
  } else {
    console.log('Status:', receipt.status === 1 ? 'Success' : 'Reverted');
    console.log('Block Number:', receipt.blockNumber);
    console.log('From (User):', receipt.from);
    
    // Check current yield target
    const COINAI_ADDRESS = '0x588DeC15D915659E8BF36c01e662479916301d3A';
    const COINAI_ABI = [
      'function accountOf(address user) view returns (uint16 splitBps,uint128 spend,uint128 shares,uint64 lockUntil,uint8 yieldTarget)'
    ];
    const contract = new Contract(COINAI_ADDRESS, COINAI_ABI, provider);
    
    const acc = await contract.accountOf(receipt.from);
    console.log('\nCurrent Account State for', receipt.from, ':');
    console.log('Yield Target:', acc.yieldTarget, '(0 = SparkDEX, 1 = Firelight, 2 = Upshift)');
  }
}

main().catch(console.error);
