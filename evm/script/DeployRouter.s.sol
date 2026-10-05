// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../src/DepositRouter.sol";

/// Deploys the tBNB deposit router next to the live CoinAI deployment and fills its tUSDT reserve.
/// COINAI, TOKEN and TREASURY (the agent wallet, which receives deposited tBNB for gas) come from env:
/// forge script script/DeployRouter.s.sol --rpc-url bsc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract DeployRouter is Script {
    // Chainlink BNB/USD on BSC Testnet (8 decimals)
    address constant BNB_USD_FEED = 0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526;

    function run() external {
        vm.startBroadcast();
        DepositRouter router =
            new DepositRouter(vm.envAddress("COINAI"), vm.envAddress("TOKEN"), BNB_USD_FEED, vm.envAddress("TREASURY"));
        router.refill();
        vm.stopBroadcast();

        console.log("DepositRouter:", address(router));
        console.log("Reserve (tUSDT, 6 dp):", router.reserve());
    }
}
