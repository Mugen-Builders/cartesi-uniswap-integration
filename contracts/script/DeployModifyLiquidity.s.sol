// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {ModifyLiquidity} from "../src/modifyLiquidity.sol";

contract DeployModifyLiquidityScript is Script {
    function run() external {
        address poolManagerAddr = vm.envAddress("POOL_MANAGER_ADDRESS");

        vm.startBroadcast();
        ModifyLiquidity modifyLiquidity = new ModifyLiquidity(IPoolManager(poolManagerAddr));
        vm.stopBroadcast();

        console.log("ModifyLiquidity:", address(modifyLiquidity));
        console.log("PoolManager:", poolManagerAddr);
    }
}
