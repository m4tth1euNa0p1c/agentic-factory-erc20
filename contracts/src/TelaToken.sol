// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title TelaToken — ERC-20 used for TCE, TCD and TIF (spec 001).
/// @notice 6 decimals (H-02). Business transfers carry a unique ref that can be consumed once (D-03),
///         which gives an on-chain guard against double execution of the same business operation.
contract TelaToken is ERC20, ERC20Permit, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @dev ref => consumed. Global for the token (not per sender).
    mapping(bytes32 ref => bool used) private _usedReferences;

    error ReferenceAlreadyUsed(bytes32 ref);
    error ZeroReference();
    error ZeroAmount();
    error ZeroAddress();

    event TransferWithReference(bytes32 indexed ref, address indexed from, address indexed to, uint256 amount);

    constructor(string memory name_, string memory symbol_, address admin, address minter, address pauser)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        if (admin == address(0) || minter == address(0) || pauser == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
        _grantRole(PAUSER_ROLE, pauser);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Transfer `amount` to `to`, tagged with a business `ref` that can only be used once.
    function transferWithReference(address to, uint256 amount, bytes32 ref) external returns (bool) {
        _consumeReference(ref, amount);
        _transfer(_msgSender(), to, amount);
        emit TransferWithReference(ref, _msgSender(), to, amount);
        return true;
    }

    function isReferenceUsed(bytes32 ref) external view returns (bool) {
        return _usedReferences[ref];
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        _mint(to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @dev Effects before interactions: the ref is marked before any balance movement.
    ///      A revert later in the call (insufficient balance, pause) rolls the mark back atomically.
    function _consumeReference(bytes32 ref, uint256 amount) internal {
        if (ref == bytes32(0)) revert ZeroReference();
        if (amount == 0) revert ZeroAmount();
        if (_usedReferences[ref]) revert ReferenceAlreadyUsed(ref);
        _usedReferences[ref] = true;
    }

    /// @dev Single choke point: every balance movement (transfer, mint, burn) honours the pause.
    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        super._update(from, to, value);
    }
}
