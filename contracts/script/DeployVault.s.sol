// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {USDCVaultWithLiquidity} from "../src/USDCVaultWithLiquidity.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";

contract DeployVaultScript is Script {
    function run() external {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address pairToken = vm.envAddress("USDT_ADDRESS"); // or other pair token (e.g. USDT)
        address poolManagerAddr = vm.envAddress("POOL_MANAGER_ADDRESS");
        uint24 fee = uint24(vm.envOr("POOL_FEE", uint256(3000))); // 0.3% default
        int24 tickSpacing = int24(vm.envOr("POOL_TICK_SPACING", int256(60)));
        address hooksAddr = vm.envOr("HOOKS_ADDRESS", address(0));

        (address c0, address c1) = usdc < pairToken ? (usdc, pairToken) : (pairToken, usdc);
        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hooksAddr)
        });

        vm.startBroadcast();
        USDCVaultWithLiquidity vault = new USDCVaultWithLiquidity(usdc, pairToken, IPoolManager(poolManagerAddr));
        vm.stopBroadcast();

        console.log("USDCVaultWithLiquidity:", address(vault));
    }
}
