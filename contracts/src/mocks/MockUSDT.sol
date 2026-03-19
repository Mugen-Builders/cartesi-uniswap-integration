// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title MockUSDT
/// @notice Minimal ERC20 for testing: "Tether USD", 6 decimals. For use with liquidity pool scripts.
contract MockUSDT is IERC20 {
    string public constant name = "Tether USD";
    string public constant symbol = "USDT";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public immutable initialMintTo;

    constructor(address _initialMintTo) {
        initialMintTo = _initialMintTo;
        if (_initialMintTo != address(0)) {
            uint256 amount = 10_000_000 * 1e6; // 10M USDT
            totalSupply = amount;
            balanceOf[_initialMintTo] = amount;
            emit Transfer(address(0), _initialMintTo, amount);
        }
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    /// @notice Mint tokens (for testing / seeding pool). No access control.
    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
