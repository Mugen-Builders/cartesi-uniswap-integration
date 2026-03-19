// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidity} from "../src/modifyLiquidity.sol";
import {USDCVaultWithLiquidity} from "../src/USDCVaultWithLiquidity.sol";

contract CallModifyLiquidityMeScript is Script {
    // Configure these values directly in-script.
    address internal constant MODIFY_LIQUIDITY_ADDRESS = 0xB16bF76958Ea8EDdb16ab2d66D5d468817E3C645;
    int24 internal constant ML_TICK_LOWER = -887220;
    int24 internal constant ML_TICK_UPPER = 887220;
    // In your prior run, 1_000_000 liquidityDelta pulled ~1 token each.
    // Scale by 1000 to target ~1000 tokens each for the same pool config/range.
    int256 internal constant ML_LIQUIDITY_DELTA = 1_000_000_000;
    bytes32 internal constant ML_SALT = bytes32(0);
    bytes internal constant ML_HOOK_DATA = hex"";
    uint256 internal constant ML_ETH_VALUE = 0;
    address internal constant USDC_ADDRESS = 0xe08760f90822cAb7755449091414AAF7e0b458c1;
    address internal constant USDT_ADDRESS = 0xF3c79e7B48d662b989b042d78C619C524D6FDd26;
    uint256 internal constant APPROVAL_AMOUNT = type(uint256).max;

    function run() external {
        IPoolManager.ModifyLiquidityParams memory params = IPoolManager.ModifyLiquidityParams({
            tickLower: ML_TICK_LOWER, tickUpper: ML_TICK_UPPER, liquidityDelta: ML_LIQUIDITY_DELTA, salt: ML_SALT
        });

        vm.startBroadcast();
        // Required so CurrencySettler.transferFrom(...) can pull tokens from msg.sender.
        IERC20(USDC_ADDRESS).approve(MODIFY_LIQUIDITY_ADDRESS, APPROVAL_AMOUNT);
        IERC20(USDT_ADDRESS).approve(MODIFY_LIQUIDITY_ADDRESS, APPROVAL_AMOUNT);
        // BalanceDelta delta =
        //     // ModifyLiquidity(MODIFY_LIQUIDITY_ADDRESS).modifyLiquidity_me{value: ML_ETH_VALUE}(params, ML_HOOK_DATA);
            USDCVaultWithLiquidity(MODIFY_LIQUIDITY_ADDRESS).modifyLiquidity(params, ML_HOOK_DATA, false, false);
        vm.stopBroadcast();

        console.log("ModifyLiquidity:", MODIFY_LIQUIDITY_ADDRESS);
        console.log("USDC approved for spender:", MODIFY_LIQUIDITY_ADDRESS);
        console.log("USDT approved for spender:", MODIFY_LIQUIDITY_ADDRESS);
        console.logInt(ML_LIQUIDITY_DELTA);
        console.log("tickLower:", ML_TICK_LOWER);
        console.log("tickUpper:", ML_TICK_UPPER);
        console.logBytes32(ML_SALT);
        // console.log("raw BalanceDelta:", BalanceDelta.unwrap(delta));
    }
}
