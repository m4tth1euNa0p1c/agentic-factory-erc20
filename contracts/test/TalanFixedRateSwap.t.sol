// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TelaToken} from "../src/TelaToken.sol";
import {TalanFixedRateSwap} from "../src/TalanFixedRateSwap.sol";

/// Spec 001 T009 — skeleton only (swap logic: spec 003).
contract TalanFixedRateSwapSkeletonTest is Test {
    TelaToken internal tce;
    TelaToken internal tcd;
    address internal admin = makeAddr("admin");

    function setUp() public {
        tce = new TelaToken("Talan Coin Euro", "TCE", admin, admin, admin);
        tcd = new TelaToken("Talan Coin Dollar", "TCD", admin, admin, admin);
    }

    function test_quote_floorsAt115Over100() public {
        TalanFixedRateSwap s = new TalanFixedRateSwap(IERC20(address(tce)), IERC20(address(tcd)), 115, 100, admin, admin);
        assertEq(s.quote(100e6), 115e6); // F-04
        assertEq(s.quote(1), 1); // floor(1.15) (H-06)
        assertEq(s.quote(0), 0);
        assertTrue(s.hasRole(s.LIQUIDITY_ROLE(), admin));
    }

    function test_constructor_rejectsInvalidParams() public {
        vm.expectRevert(TalanFixedRateSwap.ZeroAddress.selector);
        new TalanFixedRateSwap(IERC20(address(0)), IERC20(address(tcd)), 115, 100, admin, admin);
        vm.expectRevert(TalanFixedRateSwap.InvalidRate.selector);
        new TalanFixedRateSwap(IERC20(address(tce)), IERC20(address(tcd)), 0, 100, admin, admin);
    }

    function test_token_constructor_rejectsZeroAddress() public {
        vm.expectRevert(TelaToken.ZeroAddress.selector);
        new TelaToken("X", "X", address(0), admin, admin);
    }

    function test_token_mint_rejectsZero() public {
        vm.prank(admin);
        vm.expectRevert(TelaToken.ZeroAmount.selector);
        tce.mint(admin, 0);
    }
}
