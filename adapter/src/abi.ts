// Minimal TelaToken ABI used by the adapter. Parity with contracts/abi/TelaToken.json is enforced by test/abi.test.ts.
import { parseAbi } from "viem";

export const telaTokenAbi = parseAbi([
  "function transferWithReference(address to, uint256 amount, bytes32 ref) returns (bool)",
  "function isReferenceUsed(address sender, bytes32 ref) view returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "event TransferWithReference(bytes32 indexed ref, address indexed from, address indexed to, uint256 amount)",
  "error ReferenceAlreadyUsed(bytes32 ref)",
  "error ZeroReference()",
  "error ZeroAmount()",
  "error ZeroAddress()",
  "error EnforcedPause()",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InvalidReceiver(address receiver)",
  "error ERC20InvalidSender(address sender)",
]);
