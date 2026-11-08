// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TalanFixedRateSwap — skeleton (spec 001 T009). Swap logic is specified in spec 003.
/// @notice Rate expressed as rateNumerator / rateDenominator TCD per TCE (F-04: 115/100).
contract TalanFixedRateSwap is AccessControl {
    bytes32 public constant LIQUIDITY_ROLE = keccak256("LIQUIDITY_ROLE");

    IERC20 public immutable tokenIn; // TCE
    IERC20 public immutable tokenOut; // TCD
    uint256 public immutable rateNumerator;
    uint256 public immutable rateDenominator;

    error ZeroAddress();
    error InvalidRate();

    constructor(IERC20 tokenIn_, IERC20 tokenOut_, uint256 rateNumerator_, uint256 rateDenominator_, address admin, address liquidity) {
        if (address(tokenIn_) == address(0) || address(tokenOut_) == address(0) || admin == address(0) || liquidity == address(0)) {
            revert ZeroAddress();
        }
        if (rateNumerator_ == 0 || rateDenominator_ == 0) revert InvalidRate();
        tokenIn = tokenIn_;
        tokenOut = tokenOut_;
        rateNumerator = rateNumerator_;
        rateDenominator = rateDenominator_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(LIQUIDITY_ROLE, liquidity);
    }

    /// @notice Quote: floor(amountIn * rateNumerator / rateDenominator) (H-06).
    function quote(uint256 amountIn) public view returns (uint256) {
        return amountIn * rateNumerator / rateDenominator;
    }
}
