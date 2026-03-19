// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Merged USDC vault + Uniswap v4 liquidity adapter in one contract.
// Requires: forge install Uniswap/v4-core Uniswap/v4-periphery
// Remappings: v4-core/=lib/v4-core/  v4-periphery/=lib/v4-periphery/  @uniswap/v4-core/=lib/v4-core/

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {SafeCallback} from "v4-periphery/src/base/SafeCallback.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TransientStateLibrary} from "v4-core/src/libraries/TransientStateLibrary.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {CurrencySettler} from "v4-core/test/utils/CurrencySettler.sol";

/// @title USDCVaultWithLiquidity
/// @notice Single contract: holds USDC, deploys to Uniswap v4 USDT/USDC LP. Replaces the
///         previous USDCVault + UniswapV4LiquidityAdapter split. Tokens reach the vault only
///         when the Cartesi application emits a voucher for add-liquidity. User balances
///         are tracked off-chain by the Cartesi application; withdrawal vouchers are only
///         emitted after the application verifies the user has sufficient balance.
contract USDCVaultWithLiquidity is SafeCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencySettler for Currency;
    using Hooks for IHooks;
    using LPFeeLibrary for uint24;
    using StateLibrary for IPoolManager;
    using TransientStateLibrary for IPoolManager;

    // --- Vault state ---
    IERC20 public immutable usdc;
    IERC20 public immutable usdt;
    address public cartesiDApp;
    address public immutable deployer;
    IPoolManager public immutable manager;
    uint256 public constant DEPLOY_THRESHOLD = 1_000 * 1e6; // 1,000 USDC (6 decimals)
    uint256 public totalDeployedInLp; // USDC equivalent in LP
    int24 internal constant ML_TICK_LOWER = -887220;
    int24 internal constant ML_TICK_UPPER = 887220;
    bytes internal constant ML_HOOK_DATA = hex"";

    // --- Adapter state (Uniswap v4 LP) ---
    PoolKey public poolKey;
    uint128 public totalLiquidity;
    uint256 public totalDeployed; // USDC equivalent we have in the pool (for proportional removal)

    event LiquidityAddedFromApplication(uint256 usdcAmount);
    event LiquidityAdded(uint256 usdcAmount, uint256 liquidityAdded);
    event WithdrawnFromLiquidity(uint256 usdcAmount);
    event LiquidityRemoved(uint256 usdcAmount);
    event WithdrawalToUser(address indexed user, uint256 usdcAmount);
    event CartesiDAppSet(address indexed cartesiDApp);

    error OnlyDeployer();
    error ZeroAmount();
    error InsufficientIdleBalance();
    error InsufficientDeployed();
    error TransferFailed();

    modifier onlyDeployer() {
        if (msg.sender != deployer) revert OnlyDeployer();
        _;
    }

    constructor(address _usdc, address _usdt, IPoolManager _poolManager) SafeCallback(_poolManager) {
        deployer = msg.sender;
        manager = _poolManager;
        usdc = IERC20(_usdc);
        usdt = IERC20(_usdt);
        poolKey = PoolKey({
            currency0: Currency.wrap(_usdc),
            currency1: Currency.wrap(_usdt),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(0x0000000000000000000000000000000000000000)
        });
    }

    struct CallbackData {
        address sender;
        PoolKey key;
        IPoolManager.ModifyLiquidityParams params;
        bytes hookData;
        bool settleUsingBurn;
        bool takeClaims;
    }

    function setCartesiDApp(address _cartesiDApp) external onlyDeployer {
        cartesiDApp = _cartesiDApp;
        emit CartesiDAppSet(_cartesiDApp);
    }

    // ---------- Vault: deposit / withdraw ----------

    /// @notice Pull USDC from the Cartesi application (msg.sender) and add to LP.
    ///         Called by the application via voucher when deployed deposits reach threshold.
    function addLiquidityFromApplication(int256 usdcAmount) external returns (BalanceDelta delta) {
        IPoolManager.ModifyLiquidityParams memory params = IPoolManager.ModifyLiquidityParams({
            tickLower: ML_TICK_LOWER, tickUpper: ML_TICK_UPPER, liquidityDelta: usdcAmount, salt: bytes32(0)
        });

        if (usdcAmount == 0) revert ZeroAmount();
        totalDeployedInLp += uint256(usdcAmount);
        delta = modifyLiquidity(params, ML_HOOK_DATA, false, false);
        emit LiquidityAddedFromApplication(uint256(usdcAmount));
    }

    function modifyLiquidity(
        IPoolManager.ModifyLiquidityParams memory params,
        bytes memory hookData,
        bool settleUsingBurn,
        bool takeClaims
    ) public payable returns (BalanceDelta delta) {
        delta = abi.decode(
            manager.unlock(
                abi.encode(CallbackData(msg.sender, poolKey, params, hookData, settleUsingBurn, takeClaims))
            ),
            (BalanceDelta)
        );

        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            CurrencyLibrary.ADDRESS_ZERO.transfer(msg.sender, ethBalance);
        }
    }

    function _fetchBalances(Currency currency, address user, address deltaHolder)
        internal
        view
        returns (uint256 userBalance, uint256 poolBalance, int256 delta)
    {
        userBalance = currency.balanceOf(user);
        poolBalance = currency.balanceOf(address(manager));
        delta = manager.currencyDelta(deltaHolder, currency);
    }

    function _unlockCallback(bytes calldata rawData) internal override returns (bytes memory) {
        CallbackData memory data = abi.decode(rawData, (CallbackData));

        (uint128 liquidityBefore,,) = manager.getPositionInfo(
            data.key.toId(), address(this), data.params.tickLower, data.params.tickUpper, data.params.salt
        );

        (BalanceDelta delta,) = manager.modifyLiquidity(data.key, data.params, data.hookData);

        (uint128 liquidityAfter,,) = manager.getPositionInfo(
            data.key.toId(), address(this), data.params.tickLower, data.params.tickUpper, data.params.salt
        );

        (,, int256 delta0) = _fetchBalances(data.key.currency0, data.sender, address(this));
        (,, int256 delta1) = _fetchBalances(data.key.currency1, data.sender, address(this));

        require(
            int128(liquidityBefore) + data.params.liquidityDelta == int128(liquidityAfter), "liquidity change incorrect"
        );

        if (data.params.liquidityDelta < 0) {
            assert(delta0 > 0 || delta1 > 0);
            assert(!(delta0 < 0 || delta1 < 0));
        } else if (data.params.liquidityDelta > 0) {
            assert(delta0 < 0 || delta1 < 0);
            assert(!(delta0 > 0 || delta1 > 0));
        }

        if (delta0 < 0) data.key.currency0.settle(manager, data.sender, uint256(-delta0), data.settleUsingBurn);
        if (delta1 < 0) data.key.currency1.settle(manager, data.sender, uint256(-delta1), data.settleUsingBurn);
        if (delta0 > 0) data.key.currency0.take(manager, data.sender, uint256(delta0), data.takeClaims);
        if (delta1 > 0) data.key.currency1.take(manager, data.sender, uint256(delta1), data.takeClaims);

        return abi.encode(delta);
    }

    /// @notice Send USDC to a user. Only called by the application via voucher after it
    ///         has verified the user has sufficient balance. Uses idle balance first; removes from LP if needed.
    function withdrawToUser(address user, uint256 usdcAmount) external {
        if (usdcAmount == 0) revert ZeroAmount();
        uint256 idle = idleBalance();
        if (idle >= usdcAmount) {
            if (!usdc.transfer(user, usdcAmount)) revert TransferFailed();
            emit WithdrawalToUser(user, usdcAmount);
        } else {
            uint256 needFromLp = usdcAmount - idle;
            if (needFromLp > totalDeployedInLp) revert InsufficientDeployed();

            IPoolManager.ModifyLiquidityParams memory params = IPoolManager.ModifyLiquidityParams({
                tickLower: ML_TICK_LOWER,
                tickUpper: ML_TICK_UPPER,
                liquidityDelta: -int256(needFromLp),
                salt: bytes32(0)
            });

            // Do not swap on withdrawal: remove liquidity only, then pay user with available idle USDC.
            modifyLiquidityFromVault(params, ML_HOOK_DATA, false, false);

            uint256 balanceNow = usdc.balanceOf(address(this));
            uint256 usdcPulledFromLp = balanceNow > idle ? (balanceNow - idle) : 0;
            if (usdcPulledFromLp > totalDeployedInLp) usdcPulledFromLp = totalDeployedInLp;
            totalDeployedInLp -= usdcPulledFromLp;

            uint256 toSend = balanceNow >= usdcAmount ? usdcAmount : balanceNow;
            if (toSend > 0) {
                if (!usdc.transfer(user, toSend)) revert TransferFailed();
                emit WithdrawalToUser(user, toSend);
            }
            emit WithdrawnFromLiquidity(needFromLp);
        }
    }

    /// @notice Modify liquidity where this vault settles/takes deltas itself (used for liquidity removal on withdraw).
    function modifyLiquidityFromVault(
        IPoolManager.ModifyLiquidityParams memory params,
        bytes memory hookData,
        bool settleUsingBurn,
        bool takeClaims
    ) internal returns (BalanceDelta delta) {
        delta = abi.decode(
            manager.unlock(abi.encode(CallbackData(address(this), poolKey, params, hookData, settleUsingBurn, takeClaims))),
            (BalanceDelta)
        );
    }

    function idleBalance() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function totalUsdcUnderManagement() public view returns (uint256) {
        return idleBalance() + totalDeployedInLp;
    }

    function getReserveBalance() external view returns (uint256) {
        return idleBalance();
    }

    function _removeLiquidityCallback(uint256 usdcAmount) internal {
        uint256 liquidityToRemove = totalDeployed == 0 ? 0 : (uint256(totalLiquidity) * usdcAmount) / totalDeployed;
        if (liquidityToRemove == 0) return;

        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        IPoolManager.ModifyLiquidityParams memory params = IPoolManager.ModifyLiquidityParams({
            tickLower: tickLower, tickUpper: tickUpper, liquidityDelta: -int256(liquidityToRemove), salt: bytes32(0)
        });
        (BalanceDelta delta,) = poolManager.modifyLiquidity(poolKey, params, "");
        _takeBoth(delta.amount0(), delta.amount1());

        totalLiquidity -= uint128(liquidityToRemove);
        totalDeployed -= usdcAmount;

        bool zeroForOne = !_isUsdcCurrency0();
        uint256 otherAmount = _isUsdcCurrency0() ? uint256(int256(delta.amount1())) : uint256(int256(delta.amount0()));
        if (otherAmount > 0) {
            IPoolManager.SwapParams memory swapParams = IPoolManager.SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(otherAmount),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            });
            BalanceDelta swapDelta = poolManager.swap(poolKey, swapParams, "");
            _settleDeltas(swapDelta.amount0(), swapDelta.amount1());
        }
        // USDC stays on this contract (we are the vault)
        emit LiquidityRemoved(usdcAmount);
    }

    function _isUsdcCurrency0() internal view returns (bool) {
        return Currency.unwrap(poolKey.currency0) == address(usdc);
    }

    function _fullRangeTicks() internal view returns (int24 tickLower, int24 tickUpper) {
        int24 spacing = poolKey.tickSpacing;
        tickLower = TickMath.minUsableTick(spacing);
        tickUpper = TickMath.maxUsableTick(spacing);
    }

    // ---------- Position view (formerly on adapter) ----------

    function getPositionAmountsAndOrder()
        external
        view
        returns (uint256 amount0, uint256 amount1, bool isUsdcCurrency0)
    {
        (amount0, amount1) = getPositionAmounts();
        isUsdcCurrency0 = _isUsdcCurrency0();
    }

    function getPositionAmounts() public view returns (uint256 amount0, uint256 amount1) {
        if (totalLiquidity == 0) return (0, 0);
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks();
        uint160 sqrtPriceAX96 = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtPriceBX96 = TickMath.getSqrtPriceAtTick(tickUpper);
        (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(poolManager, poolKey.toId());
        if (sqrtPriceAX96 > sqrtPriceBX96) (sqrtPriceAX96, sqrtPriceBX96) = (sqrtPriceBX96, sqrtPriceAX96);
        if (sqrtPriceX96 <= sqrtPriceAX96) {
            amount0 = _getAmount0ForLiquidity(sqrtPriceAX96, sqrtPriceBX96, totalLiquidity);
        } else if (sqrtPriceX96 < sqrtPriceBX96) {
            amount0 = _getAmount0ForLiquidity(sqrtPriceX96, sqrtPriceBX96, totalLiquidity);
            amount1 = _getAmount1ForLiquidity(sqrtPriceAX96, sqrtPriceX96, totalLiquidity);
        } else {
            amount1 = _getAmount1ForLiquidity(sqrtPriceAX96, sqrtPriceBX96, totalLiquidity);
        }
    }

    function _getAmount0ForLiquidity(uint160 sqrtPriceAX96, uint160 sqrtPriceBX96, uint128 liquidity)
        internal
        pure
        returns (uint256 amount0)
    {
        return FullMath.mulDiv(
            uint256(liquidity) << FixedPoint96.RESOLUTION, sqrtPriceBX96 - sqrtPriceAX96, sqrtPriceBX96
        ) / sqrtPriceAX96;
    }

    function _getAmount1ForLiquidity(uint160 sqrtPriceAX96, uint160 sqrtPriceBX96, uint128 liquidity)
        internal
        pure
        returns (uint256 amount1)
    {
        return FullMath.mulDiv(liquidity, sqrtPriceBX96 - sqrtPriceAX96, FixedPoint96.Q96);
    }

    function _settleDeltas(int128 amount0, int128 amount1) internal {
        if (amount0 < 0) {
            poolManager.sync(poolKey.currency0);
            CurrencyLibrary.transfer(poolKey.currency0, address(poolManager), uint256(uint128(-amount0)));
            poolManager.settle();
        }
        if (amount1 < 0) {
            poolManager.sync(poolKey.currency1);
            CurrencyLibrary.transfer(poolKey.currency1, address(poolManager), uint256(uint128(-amount1)));
            poolManager.settle();
        }
        if (amount0 > 0) poolManager.take(poolKey.currency0, address(this), uint256(uint128(amount0)));
        if (amount1 > 0) poolManager.take(poolKey.currency1, address(this), uint256(uint128(amount1)));
    }

    function _takeBoth(int128 amount0, int128 amount1) internal {
        if (amount0 > 0) poolManager.take(poolKey.currency0, address(this), uint256(uint128(amount0)));
        if (amount1 > 0) poolManager.take(poolKey.currency1, address(this), uint256(uint128(amount1)));
    }
}
