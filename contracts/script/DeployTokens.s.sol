// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

/// @notice Deploys MockUSDC and MockUSDT using CREATE2 so addresses are deterministic for the same
///         deployer and compiler settings. Use for local liquidity pool testing (e.g. Uniswap v4 USDC/USDT).
/// @dev For cross-chain same addresses: use same deployer EOA, pin solc, set bytecode_hash = "none" and
///      cbor_metadata = false in foundry.toml (or use profile create2).
contract DeployTokensScript is Script {
    // Fixed salts: same salt + same deployer + same initCode => same address every time
    bytes32 internal constant SALT_USDC = keccak256("cartesi-uniswap-integration-mock-usdc2");
    bytes32 internal constant SALT_USDT = keccak256("cartesi-uniswap-integration-mock-usdt2");

    uint256 internal constant INITIAL_MINT = 10_000_000 * 1e6; // 10M tokens (6 decimals)

    function run() external {
        address deployer = vm.envOr("DEPLOYER", msg.sender);
        if (deployer == address(0)) deployer = msg.sender;
        address mintTo = vm.envOr("MINT_TO", deployer);

        vm.startBroadcast();

        // Deploy with address(0) so initCode is fixed and CREATE2 addresses are deterministic
        MockUSDC usdc = new MockUSDC{salt: SALT_USDC}(address(0));
        MockUSDT usdt = new MockUSDT{salt: SALT_USDT}(address(0));
        usdc.mint(mintTo, INITIAL_MINT);
        usdt.mint(mintTo, INITIAL_MINT);

        vm.stopBroadcast();

        console.log("MockUSDC (CREATE2):", address(usdc));
        console.log("MockUSDT (CREATE2):", address(usdt));
        console.log("Deployer:", deployer);
        console.log("Mint to:", mintTo);
        console.log("USDC totalSupply:", usdc.totalSupply());
        console.log("USDT totalSupply:", usdt.totalSupply());
    }

    /// @notice Compute CREATE2 addresses without deploying (same deployer + salts + initCode => same addresses).
    function computeAddresses(address deployerAddress)
        external
        pure
        returns (address usdcAddress, address usdtAddress)
    {
        bytes memory initCodeUSDC = abi.encodePacked(type(MockUSDC).creationCode, abi.encode(address(0)));
        bytes memory initCodeUSDT = abi.encodePacked(type(MockUSDT).creationCode, abi.encode(address(0)));
        usdcAddress = _create2Address(deployerAddress, SALT_USDC, keccak256(initCodeUSDC));
        usdtAddress = _create2Address(deployerAddress, SALT_USDT, keccak256(initCodeUSDT));
    }

    function _create2Address(address deployer_, bytes32 salt_, bytes32 initCodeHash) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer_, salt_, initCodeHash)))));
    }
}
