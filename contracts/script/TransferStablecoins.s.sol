// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

contract TransferStablecoinsScript is Script {
    uint256 internal constant WHOLE_TOKENS = 1000;

    function run() external {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address usdt = vm.envAddress("USDT_ADDRESS");
        address recipient = 0xB16bF76958Ea8EDdb16ab2d66D5d468817E3C645;

        uint256 usdcAmount = _toTokenUnits(usdc, WHOLE_TOKENS);
        uint256 usdtAmount = _toTokenUnits(usdt, WHOLE_TOKENS);

        vm.startBroadcast();
        _transferToken(usdc, recipient, usdcAmount);
        _transferToken(usdt, recipient, usdtAmount);
        vm.stopBroadcast();

        console.log("Recipient:", recipient);
        console.log("USDC sent (raw units):", usdcAmount);
        console.log("USDT sent (raw units):", usdtAmount);
    }

    function _transferToken(address token, address to, uint256 amount) internal {
        bool ok = IERC20(token).transfer(to, amount);
        require(ok, "transfer failed");
    }

    function _toTokenUnits(address token, uint256 wholeTokens) internal view returns (uint256) {
        uint8 dec = _decimalsOrDefault(token, 18);
        return wholeTokens * (10 ** uint256(dec));
    }

    function _decimalsOrDefault(address token, uint8 fallbackDecimals) internal view returns (uint8 dec) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!ok || data.length < 32) return fallbackDecimals;
        dec = abi.decode(data, (uint8));
    }
}
