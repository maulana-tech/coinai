// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../src/CoinAIBadges.sol";

/// Deploys the soulbound saving badges next to coinAI v2. COINAI (v2) and MINTER (the agent wallet) come from env:
/// forge script script/DeployBadges.s.sol --rpc-url bsc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract DeployBadges is Script {
    function run() external {
        vm.startBroadcast();
        CoinAIBadges badges = new CoinAIBadges(vm.envAddress("COINAI"), vm.envAddress("MINTER"));
        vm.stopBroadcast();
        console.log("CoinAIBadges:", address(badges));
    }
}
