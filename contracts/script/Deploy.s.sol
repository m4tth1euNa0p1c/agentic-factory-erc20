// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TelaToken} from "../src/TelaToken.sol";
import {TalanFixedRateSwap} from "../src/TalanFixedRateSwap.sol";

/// Deploys TCE, TCD, TIF and the swap skeleton. Signed by Web3Signer (`--unlocked`), never with a raw key.
/// Env: DEPLOYER_ADDRESS, TREASURY_ADDRESS, OPERATOR_ADDRESS, ALICE_ADDRESS
contract Deploy is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address operator = vm.envAddress("OPERATOR_ADDRESS");

        vm.startBroadcast(deployer);
        TelaToken tce = new TelaToken("Talan Coin Euro", "TCE", deployer, treasury, operator);
        TelaToken tcd = new TelaToken("Talan Coin Dollar", "TCD", deployer, treasury, operator);
        TelaToken tif = new TelaToken("Talan Investment Fund", "TIF", deployer, treasury, operator); // H-07
        TalanFixedRateSwap swap =
            new TalanFixedRateSwap(IERC20(address(tce)), IERC20(address(tcd)), 115, 100, deployer, treasury);
        vm.stopBroadcast();

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "deployedAtBlock", block.number);
        vm.serializeAddress(o, "TCE", address(tce));
        vm.serializeAddress(o, "TCD", address(tcd));
        vm.serializeAddress(o, "TIF", address(tif));
        string memory json = vm.serializeAddress(o, "SWAP", address(swap));
        vm.writeJson(json, "./deployments/local.json");
        console2.log("TCE", address(tce));
        console2.log("TCD", address(tcd));
        console2.log("TIF", address(tif));
        console2.log("SWAP", address(swap));
    }
}

/// Seeds test balances: treasury mints 1,000,000 TCE to Alice and 1,000,000 TCD of swap liquidity reserve.
contract Seed is Script {
    function run() external {
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address alice = vm.envAddress("ALICE_ADDRESS");
        TelaToken tce = TelaToken(vm.envAddress("TCE_ADDRESS"));
        TelaToken tcd = TelaToken(vm.envAddress("TCD_ADDRESS"));
        vm.startBroadcast(treasury);
        tce.mint(alice, 1_000_000e6);
        tcd.mint(treasury, 1_000_000e6);
        vm.stopBroadcast();
    }
}
