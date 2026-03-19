// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

interface IUSDCVaultWithLiquidity {
    function withdrawToUser(address user, uint256 usdcAmount) external;
}

contract WithdrawToUserScript is Script {
    // Configure these values before running.
    address internal constant VAULT_ADDRESS = 0xB16bF76958Ea8EDdb16ab2d66D5d468817E3C645;
    address internal constant USER = 0xbD8Eba8Bf9e56ad92F4C4Fc89D6CB88902535749;
    uint256 internal constant USDC_AMOUNT = 100 * 1e6; // 100 USDC (6 decimals)

    function run() external {
        vm.startBroadcast();
        IUSDCVaultWithLiquidity(VAULT_ADDRESS).withdrawToUser(USER, USDC_AMOUNT);
        vm.stopBroadcast();

        console.log("Vault:", VAULT_ADDRESS);
        console.log("User:", USER);
        console.log("USDC amount (raw):", USDC_AMOUNT);
    }
}
