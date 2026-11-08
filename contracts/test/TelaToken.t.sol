// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {TelaToken} from "../src/TelaToken.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// Spec 001 / US2 acceptance scenarios 1-5 + fuzz + invariant on reference uniqueness.
contract TelaTokenTest is Test {
    TelaToken internal tce;
    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event TransferWithReference(bytes32 indexed ref, address indexed from, address indexed to, uint256 amount);

    function setUp() public {
        tce = new TelaToken("Talan Coin Euro", "TCE", admin, treasury, operator);
        vm.prank(treasury);
        tce.mint(alice, 100e6);
    }

    function test_metadata() public view {
        assertEq(tce.decimals(), 6); // H-02
        assertEq(tce.symbol(), "TCE");
        assertTrue(tce.hasRole(tce.MINTER_ROLE(), treasury));
        assertTrue(tce.hasRole(tce.PAUSER_ROLE(), operator));
        assertTrue(tce.hasRole(tce.DEFAULT_ADMIN_ROLE(), admin));
        assertFalse(tce.hasRole(tce.MINTER_ROLE(), admin));
    }

    // US2-2
    function test_transferWithReference_movesFundsAndEmits() public {
        bytes32 ref = keccak256("op-1");
        vm.expectEmit(true, true, true, true);
        emit TransferWithReference(ref, alice, bob, 10e6);
        vm.prank(alice);
        tce.transferWithReference(bob, 10e6, ref);
        assertEq(tce.balanceOf(bob), 10e6);
        assertEq(tce.balanceOf(alice), 90e6);
        assertTrue(tce.isReferenceUsed(ref));
    }

    // US2-3
    function test_transferWithReference_rejectsReplay() public {
        bytes32 ref = keccak256("op-1");
        vm.startPrank(alice);
        tce.transferWithReference(bob, 10e6, ref);
        vm.expectRevert(abi.encodeWithSelector(TelaToken.ReferenceAlreadyUsed.selector, ref));
        tce.transferWithReference(bob, 10e6, ref);
        vm.stopPrank();
        assertEq(tce.balanceOf(bob), 10e6);
    }

    function test_referenceIsGlobalNotPerSender() public {
        bytes32 ref = keccak256("op-1");
        vm.prank(alice);
        tce.transferWithReference(bob, 1, ref);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TelaToken.ReferenceAlreadyUsed.selector, ref));
        tce.transferWithReference(alice, 1, ref);
    }

    function test_transferWithReference_rejectsZeroAmountAndZeroRef() public {
        vm.startPrank(alice);
        vm.expectRevert(TelaToken.ZeroAmount.selector);
        tce.transferWithReference(bob, 0, keccak256("x"));
        vm.expectRevert(TelaToken.ZeroReference.selector);
        tce.transferWithReference(bob, 1, bytes32(0));
        vm.stopPrank();
    }

    function test_failedTransferDoesNotConsumeReference() public {
        bytes32 ref = keccak256("op-big");
        vm.prank(alice);
        vm.expectRevert();
        tce.transferWithReference(bob, 101e6, ref);
        assertFalse(tce.isReferenceUsed(ref));
    }

    // US2-4
    function test_mint_onlyMinter() public {
        bytes32 minterRole = tce.MINTER_ROLE(); // read before prank: an external call would consume it
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, minterRole)
        );
        tce.mint(alice, 1);
    }

    // US2-5
    function test_pause_blocksAllMovements() public {
        vm.prank(operator);
        tce.pause();
        vm.startPrank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        tce.transfer(bob, 1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        tce.transferWithReference(bob, 1, keccak256("p"));
        vm.stopPrank();
        vm.prank(treasury);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        tce.mint(alice, 1);
        vm.prank(operator);
        tce.unpause();
        vm.prank(alice);
        tce.transfer(bob, 1);
    }

    function test_pause_onlyPauser() public {
        vm.prank(alice);
        vm.expectRevert();
        tce.pause();
    }

    function testFuzz_transferWithReference(uint256 amount, bytes32 ref) public {
        vm.assume(ref != bytes32(0));
        amount = bound(amount, 1, 100e6);
        vm.prank(alice);
        tce.transferWithReference(bob, amount, ref);
        assertEq(tce.balanceOf(alice) + tce.balanceOf(bob), 100e6);
        assertEq(tce.totalSupply(), 100e6);
    }
}

/// Invariant: a reference can produce at most one balance movement; supply only changes via mint.
contract ReferenceHandler is Test {
    TelaToken internal tce;
    address[] internal actors;
    mapping(bytes32 => uint256) public executions;
    bytes32[] public refs;

    constructor(TelaToken t, address[] memory a) {
        tce = t;
        actors = a;
        for (uint256 i; i < 8; ++i) refs.push(keccak256(abi.encode(i)));
    }

    function transferRef(uint256 actorSeed, uint256 toSeed, uint256 amount, uint256 refSeed) external {
        address from = actors[actorSeed % actors.length];
        address to = actors[toSeed % actors.length];
        bytes32 ref = refs[refSeed % refs.length];
        amount = bound(amount, 1, 10e6);
        if (tce.balanceOf(from) < amount) return;
        vm.prank(from);
        try tce.transferWithReference(to, amount, ref) {
            executions[ref] += 1;
        } catch {}
    }

    function refCount() external view returns (uint256) { return refs.length; }
}

contract TelaTokenInvariantTest is Test {
    TelaToken internal tce;
    ReferenceHandler internal handler;

    function setUp() public {
        address treasury = makeAddr("treasury");
        tce = new TelaToken("Talan Coin Euro", "TCE", address(this), treasury, address(this));
        address[] memory actors = new address[](3);
        actors[0] = makeAddr("a0");
        actors[1] = makeAddr("a1");
        actors[2] = makeAddr("a2");
        vm.startPrank(treasury);
        for (uint256 i; i < 3; ++i) tce.mint(actors[i], 50e6);
        vm.stopPrank();
        handler = new ReferenceHandler(tce, actors);
        targetContract(address(handler));
    }

    function invariant_eachReferenceExecutedAtMostOnce() public view {
        for (uint256 i; i < handler.refCount(); ++i) {
            assertLe(handler.executions(handler.refs(i)), 1);
        }
    }

    function invariant_supplyConstant() public view {
        assertEq(tce.totalSupply(), 150e6);
    }
}
