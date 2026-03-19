// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Uniswap v4 hook: only the configured vault (Cartesi yield vault) can add/remove liquidity.
// Compile from repo root with v4 deps: forge install Uniswap/v4-core Uniswap/v4-periphery
// and remappings: v4-core/=lib/v4-core/src/  v4-periphery/=lib/v4-periphery/src/

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";

contract VaultLPHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    address public immutable allowedVault;

    constructor(IPoolManager _poolManager, address _allowedVault) BaseHook(_poolManager) {
        allowedVault = _allowedVault;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeAddLiquidityReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _beforeAddLiquidity(
        address sender,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) internal view override returns (bytes4) {
        require(sender == allowedVault, "VaultLPHook: only vault can add liquidity");
        return BaseHook.beforeAddLiquidity.selector;
    }

    function _beforeRemoveLiquidity(
        address sender,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) internal view override returns (bytes4) {
        require(sender == allowedVault, "VaultLPHook: only vault can remove liquidity");
        return BaseHook.beforeRemoveLiquidity.selector;
    }
}
