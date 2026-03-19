// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// import {Test} from "forge-std/Test.sol";
// import {USDCVaultWithLiquidity} from "../src/USDCVaultWithLiquidity.sol";
// import {MockUSDC} from "../src/mocks/MockUSDC.sol";
// import {MockUSDT} from "../src/mocks/MockUSDT.sol";
// import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
// import {PoolManager} from "v4-core/src/PoolManager.sol";
// import {PoolKey} from "v4-core/src/types/PoolKey.sol";
// import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
// import {Currency} from "v4-core/src/types/Currency.sol";
// import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
// import {TickMath} from "v4-core/src/libraries/TickMath.sol";
// import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
// import {PoolModifyLiquidityTest} from "v4-core/src/test/PoolModifyLiquidityTest.sol";
// import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";

// contract USDCVaultWithLiquidityTest is Test {
//     using PoolIdLibrary for PoolKey;

//     uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

//     PoolManager manager;
//     MockUSDC usdc;
//     MockUSDT usdt;
//     PoolKey poolKey;
//     PoolModifyLiquidityTest modifyLiquidityRouter;
//     USDCVaultWithLiquidity vault;

//     address application = address(0x1); // simulates Cartesi dApp sending USDC
//     address user1 = address(0x2);
//     address user2 = address(0x3);
//     address notDeployer = address(0x4);

//     uint256 constant SEED_AMOUNT_0 = 100_000 * 1e6;
//     uint256 constant SEED_AMOUNT_1 = 100_000 * 1e6;
//     int256 constant ADD_LIQUIDITY_AMOUNT = 2_000 * 1e6; // 2,000 USDC

//     function setUp() public {
//         manager = new PoolManager(address(this));
//         usdc = new MockUSDC(address(this));
//         usdt = new MockUSDT(address(this));
//         // Ensure we have enough; mocks mint 10M each to constructor arg
//         usdc.mint(address(this), 10_000_000 * 1e6);
//         usdt.mint(address(this), 10_000_000 * 1e6);

//         (address c0, address c1) = address(usdc) < address(usdt)
//             ? (address(usdc), address(usdt))
//             : (address(usdt), address(usdc));
//         poolKey = PoolKey({
//             currency0: Currency.wrap(c0),
//             currency1: Currency.wrap(c1),
//             fee: 3000,
//             tickSpacing: 60,
//             hooks: IHooks(address(0))
//         });

//         manager.initialize(poolKey, SQRT_PRICE_1_1);

//         modifyLiquidityRouter = new PoolModifyLiquidityTest(IPoolManager(address(manager)));
//         usdc.approve(address(modifyLiquidityRouter), type(uint256).max);
//         usdt.approve(address(modifyLiquidityRouter), type(uint256).max);

//         (int24 tickLower, int24 tickUpper) = _fullRangeTicks(60);
//         (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(manager, poolKey.toId());
//         uint160 sqrtPriceAL = TickMath.getSqrtPriceAtTick(tickLower);
//         uint160 sqrtPriceBU = TickMath.getSqrtPriceAtTick(tickUpper);
//         uint128 seedLiquidity = LiquidityAmounts.getLiquidityForAmounts(
//             sqrtPriceX96, sqrtPriceAL, sqrtPriceBU, SEED_AMOUNT_0, SEED_AMOUNT_1
//         );
//         IPoolManager.ModifyLiquidityParams memory seedParams = IPoolManager.ModifyLiquidityParams({
//             tickLower: tickLower,
//             tickUpper: tickUpper,
//             liquidityDelta: int256(uint256(seedLiquidity)),
//             salt: bytes32(0)
//         });
//         modifyLiquidityRouter.modifyLiquidity(poolKey, seedParams, "");

//         vault = new USDCVaultWithLiquidity(address(usdc), IPoolManager(address(manager)), poolKey);
//     }

//     function _fullRangeTicks(int24 spacing) internal pure returns (int24 tickLower, int24 tickUpper) {
//         tickLower = TickMath.minUsableTick(spacing);
//         tickUpper = TickMath.maxUsableTick(spacing);
//     }

//     // ---------- Liquidity creation: send USDC to contract ----------

//     function test_addLiquidityFromApplication_sendsUsdcAndCreatesLiquidity() public {
//         usdc.mint(application, ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         usdc.approve(address(vault), ADD_LIQUIDITY_AMOUNT);

//         uint256 totalDeployedInLpBefore = vault.totalDeployedInLp();
//         uint128 totalLiquidityBefore = vault.totalLiquidity();

//         vm.prank(application);
//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);

//         assertEq(usdc.balanceOf(application), 0, "application should have sent all USDC");
//         assertEq(vault.totalDeployedInLp(), totalDeployedInLpBefore + ADD_LIQUIDITY_AMOUNT, "totalDeployedInLp");
//         assertTrue(vault.totalLiquidity() > totalLiquidityBefore, "totalLiquidity should increase");
//         assertEq(vault.totalDeployed(), ADD_LIQUIDITY_AMOUNT, "totalDeployed (adapter state)");
//     }

//     function test_addLiquidityFromApplication_multipleBatches() public {
//         usdc.mint(application, ADD_LIQUIDITY_AMOUNT * 3);
//         vm.startPrank(application);
//         usdc.approve(address(vault), ADD_LIQUIDITY_AMOUNT * 3);

//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);
//         assertEq(vault.totalDeployedInLp(), ADD_LIQUIDITY_AMOUNT);
//         uint128 liq1 = vault.totalLiquidity();

//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);
//         assertEq(vault.totalDeployedInLp(), ADD_LIQUIDITY_AMOUNT * 2);
//         assertTrue(vault.totalLiquidity() > liq1);

//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);
//         assertEq(vault.totalDeployedInLp(), ADD_LIQUIDITY_AMOUNT * 3);
//         vm.stopPrank();
//     }

//     function test_addLiquidityFromApplication_revertsZeroAmount() public {
//         usdc.mint(application, 1000);
//         vm.prank(application);
//         usdc.approve(address(vault), 1000);
//         vm.prank(application);
//         vm.expectRevert(USDCVaultWithLiquidity.ZeroAmount.selector);
//         vault.addLiquidityFromApplication(0);
//     }

//     function test_addLiquidityFromApplication_revertsWithoutApproval() public {
//         usdc.mint(application, ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         vm.expectRevert(); // transferFrom fails
//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);
//     }

//     // ---------- Withdraw: idle first, then from LP ----------

//     function test_withdrawToUser_fromIdle() public {
//         usdc.mint(address(vault), 500 * 1e6);
//         assertEq(vault.idleBalance(), 500 * 1e6);

//         vault.withdrawToUser(user1, 300 * 1e6);

//         assertEq(usdc.balanceOf(user1), 300 * 1e6);
//         assertEq(vault.idleBalance(), 200 * 1e6);
//     }

//     function test_withdrawToUser_pullsFromLpWhenIdleInsufficient() public {
//         usdc.mint(application, ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         usdc.approve(address(vault), ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);

//         uint256 withdrawAmount = 800 * 1e6;
//         uint256 userBefore = usdc.balanceOf(user1);
//         vault.withdrawToUser(user1, withdrawAmount);

//         // LP removal can return slightly less than requested (slippage); vault sends min(amount, balance)
//         assertTrue(usdc.balanceOf(user1) >= userBefore + withdrawAmount - 10 * 1e6, "user should receive ~withdrawAmount");
//         assertEq(vault.totalDeployedInLp(), ADD_LIQUIDITY_AMOUNT - withdrawAmount);
//     }

//     function test_withdrawToUser_fullCycle_idleThenLp() public {
//         usdc.mint(application, ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         usdc.approve(address(vault), ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);

//         // First withdraw (from idle or LP depending on dust)
//         vault.withdrawToUser(user1, 500 * 1e6);
//         assertTrue(usdc.balanceOf(user1) >= 500 * 1e6 - 5 * 1e6, "user1 gets ~500 USDC");

//         // Add some idle
//         usdc.mint(address(vault), 200 * 1e6);
//         vault.withdrawToUser(user2, 200 * 1e6);
//         assertEq(usdc.balanceOf(user2), 200 * 1e6);

//         // Withdraw more from LP (may be slightly less due to slippage)
//         uint256 user1Before = usdc.balanceOf(user1);
//         vault.withdrawToUser(user1, 700 * 1e6);
//         assertTrue(usdc.balanceOf(user1) >= user1Before + 700 * 1e6 - 10 * 1e6, "user1 gets ~700 more");
//     }

//     function test_withdrawToUser_revertsZeroAmount() public {
//         vm.expectRevert(USDCVaultWithLiquidity.ZeroAmount.selector);
//         vault.withdrawToUser(user1, 0);
//     }

//     function test_withdrawToUser_revertsInsufficientDeployed() public {
//         usdc.mint(application, ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         usdc.approve(address(vault), ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);

//         uint256 tooMuch = ADD_LIQUIDITY_AMOUNT + 1;
//         vm.expectRevert(USDCVaultWithLiquidity.InsufficientDeployed.selector);
//         vault.withdrawToUser(user1, tooMuch);
//     }

//     // ---------- View functions ----------

//     function test_idleBalance_and_totalUsdcUnderManagement() public {
//         assertEq(vault.idleBalance(), 0);
//         assertEq(vault.totalUsdcUnderManagement(), 0);

//         usdc.mint(address(vault), 1000 * 1e6);
//         assertEq(vault.idleBalance(), 1000 * 1e6);
//         assertEq(vault.totalUsdcUnderManagement(), 1000 * 1e6);

//         usdc.mint(application, ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         usdc.approve(address(vault), ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);

//         // After add, some USDC may remain idle (half not fully used in LP due to pool math)
//         assertEq(vault.totalDeployedInLp(), ADD_LIQUIDITY_AMOUNT);
//         assertTrue(vault.totalUsdcUnderManagement() >= ADD_LIQUIDITY_AMOUNT);
//         assertEq(vault.getReserveBalance(), vault.idleBalance());
//     }

//     function test_getPositionAmountsAndOrder_afterAddingLiquidity() public {
//         usdc.mint(application, ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         usdc.approve(address(vault), ADD_LIQUIDITY_AMOUNT);
//         vm.prank(application);
//         vault.addLiquidityFromApplication(ADD_LIQUIDITY_AMOUNT);

//         (uint256 amount0, uint256 amount1, bool isUsdcCurrency0) = vault.getPositionAmountsAndOrder();
//         assertTrue(amount0 > 0 || amount1 > 0, "position should have amounts");
//         assertTrue(isUsdcCurrency0 == (Currency.unwrap(poolKey.currency0) == address(usdc)));
//     }

//     function test_DEPLOY_THRESHOLD_constant() public view {
//         assertEq(vault.DEPLOY_THRESHOLD(), 1_000 * 1e6);
//     }

//     // ---------- Access control ----------

//     function test_setCartesiDApp_onlyDeployer() public {
//         vault.setCartesiDApp(application);
//         assertEq(vault.cartesiDApp(), application);

//         vm.prank(notDeployer);
//         vm.expectRevert(USDCVaultWithLiquidity.OnlyDeployer.selector);
//         vault.setCartesiDApp(user1);
//     }

//     // ---------- Integration: full flow ----------

//     function test_fullFlow_depositAddLiquidityWithdrawMultipleUsers() public {
//         // 1. Application sends USDC and triggers add liquidity (simulating voucher)
//         usdc.mint(application, 5_000 * 1e6);
//         vm.prank(application);
//         usdc.approve(address(vault), 5_000 * 1e6);
//         vm.prank(application);
//         vault.addLiquidityFromApplication(5_000 * 1e6);

//         assertEq(vault.totalDeployedInLp(), 5_000 * 1e6);

//         // 2. Withdraw to user1 (may get less due to LP slippage; vault sends min(amount, balance))
//         vault.withdrawToUser(user1, 1_500 * 1e6);
//         assertTrue(usdc.balanceOf(user1) >= 1_500 * 1e6 - 500 * 1e6, "user1 received at least 1000 USDC");

//         // 3. Withdraw to user2
//         vault.withdrawToUser(user2, 2_000 * 1e6);
//         assertTrue(usdc.balanceOf(user2) >= 2_000 * 1e6 - 500 * 1e6, "user2 received at least 1500 USDC");

//         // 4. Drain remaining to user1
//         uint256 remaining = vault.totalDeployedInLp() + vault.idleBalance();
//         if (remaining > 0) vault.withdrawToUser(user1, remaining);

//         assertTrue(usdc.balanceOf(user1) > 0 || usdc.balanceOf(user2) > 0, "at least one user received USDC");
//     }
// }
