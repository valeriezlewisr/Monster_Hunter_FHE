pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MonsterHunterFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    // Custom errors for reverts
    error NotOwner();
    error NotProvider();
    error Paused();
    error TooFrequent();
    error BatchClosed();
    error BatchFull();
    error InvalidStateHash();
    error StaleWrite();
    error InvalidCooldown();

    // Events
    event MonsterRegistered(uint256 monsterId, address indexed owner);
    event AttackSubmitted(uint256 indexed monsterId, address indexed attacker, uint256 attackType);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed monsterId, uint256 batchId);
    event DamageRevealed(uint256 indexed requestId, uint256 monsterId, uint256 batchId, uint256 totalDamage);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownUpdated(uint256 newCooldown);
    event BatchOpened(uint256 indexed monsterId, uint256 batchId);
    event BatchClosed(uint256 indexed monsterId, uint256 batchId);

    // State variables
    address public owner;
    bool public paused;
    uint256 public constant MIN_INTERVAL = 5 seconds;
    uint256 public cooldownInterval = 10 seconds;
    uint256 public modelVersion;
    uint256 public currentBatchId;

    struct Monster {
        euint32 health;
        euint32 attack;
        euint32 defense;
        euint32 weakness;
        uint256 version;
    }

    struct Attack {
        euint32 damage;
        euint32 type;
        uint256 timestamp;
    }

    struct Batch {
        uint256 monsterId;
        uint256 attackCount;
        uint256 createdAt;
        bool closed;
        mapping(uint256 => Attack) attacks;
    }

    struct DecryptionContext {
        uint256 modelId;
        uint256 monsterId;
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    mapping(uint256 => Monster) public monsters;
    mapping(uint256 => Batch) public batches;
    mapping(address => bool) public providers;
    mapping(address => uint256) public lastActionAt;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkCooldown() {
        if (block.timestamp < lastActionAt[msg.sender] + cooldownInterval) {
            revert TooFrequent();
        }
        lastActionAt[msg.sender] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        modelVersion = 1;
        currentBatchId = 1;
    }

    function setCooldownInterval(uint256 newInterval) external onlyOwner {
        if (newInterval < MIN_INTERVAL) revert InvalidCooldown();
        cooldownInterval = newInterval;
        emit CooldownUpdated(newInterval);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function registerMonster(
        euint32 health,
        euint32 attack,
        euint32 defense,
        euint32 weakness
    ) external onlyProvider whenNotPaused checkCooldown returns (uint256 monsterId) {
        monsterId = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)));
        monsters[monsterId] = Monster({
            health: _initIfNeeded(health),
            attack: _initIfNeeded(attack),
            defense: _initIfNeeded(defense),
            weakness: _initIfNeeded(weakness),
            version: modelVersion
        });
        emit MonsterRegistered(monsterId, msg.sender);
    }

    function openBatch(uint256 monsterId) external onlyProvider whenNotPaused checkCooldown {
        if (monsterId == 0 || monsters[monsterId].health.isZero()) revert("Invalid monster");
        uint256 batchId = currentBatchId++;
        batches[batchId] = Batch({
            monsterId: monsterId,
            attackCount: 0,
            createdAt: block.timestamp,
            closed: false
        });
        emit BatchOpened(monsterId, batchId);
    }

    function closeBatch(uint256 batchId) external onlyProvider whenNotPaused checkCooldown {
        if (batchId == 0 || batches[batchId].monsterId == 0) revert("Invalid batch");
        batches[batchId].closed = true;
        emit BatchClosed(batches[batchId].monsterId, batchId);
    }

    function submitAttack(
        uint256 monsterId,
        uint256 batchId,
        euint32 damage,
        euint32 attackType
    ) external whenNotPaused checkCooldown {
        if (monsterId == 0 || batchId == 0) revert("Invalid IDs");
        Batch storage batch = batches[batchId];
        if (batch.closed) revert BatchClosed();
        if (batch.attackCount >= 10) revert BatchFull();

        _requireInitialized(monsters[monsterId].health, "Monster health");
        _requireInitialized(monsters[monsterId].weakness, "Monster weakness");

        batch.attacks[batch.attackCount] = Attack({
            damage: _initIfNeeded(damage),
            type: _initIfNeeded(attackType),
            timestamp: block.timestamp
        });
        batch.attackCount++;

        emit AttackSubmitted(monsterId, msg.sender, uint256(~attackType.toBytes32()));
    }

    function requestDamageDecryption(uint256 monsterId, uint256 batchId) external whenNotPaused checkCooldown {
        if (monsterId == 0 || batchId == 0) revert("Invalid IDs");
        Batch storage batch = batches[batchId];
        if (batch.attackCount == 0) revert("No attacks");

        euint32 totalDamage = FHE.asEuint32(0);
        for (uint256 i = 0; i < batch.attackCount; i++) {
            Attack storage attack = batch.attacks[i];
            ebool isWeakness = FHE.eq(attack.type, monsters[monsterId].weakness);
            euint32 weaknessMultiplier = isWeakness.select(FHE.asEuint32(2), FHE.asEuint32(1));
            totalDamage = FHE.add(totalDamage, FHE.mul(attack.damage, weaknessMultiplier));
        }

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = totalDamage.toBytes32();
        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.revealDamageCallback.selector);
        decryptionContexts[requestId] = DecryptionContext({
            modelId: modelVersion,
            monsterId: monsterId,
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, monsterId, batchId);
    }

    function revealDamageCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        DecryptionContext storage context = decryptionContexts[requestId];
        if (context.processed) revert("Already processed");

        // Rebuild cts from current storage
        euint32 totalDamage = FHE.asEuint32(0);
        Batch storage batch = batches[context.batchId];
        for (uint256 i = 0; i < batch.attackCount; i++) {
            Attack storage attack = batch.attacks[i];
            ebool isWeakness = FHE.eq(attack.type, monsters[context.monsterId].weakness);
            euint32 weaknessMultiplier = isWeakness.select(FHE.asEuint32(2), FHE.asEuint32(1));
            totalDamage = FHE.add(totalDamage, FHE.mul(attack.damage, weaknessMultiplier));
        }

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = totalDamage.toBytes32();
        bytes32 currHash = _hashCiphertexts(cts);

        // Verify state consistency
        if (currHash != context.stateHash) revert InvalidStateHash();

        // Verify proof
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartext (1 value expected)
        uint32 damage = abi.decode(cleartexts, (uint32));

        // Mark processed and emit event
        context.processed = true;
        emit DamageRevealed(requestId, context.monsterId, context.batchId, damage);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal pure returns (euint32) {
        return FHE.isInitialized(x) ? x : FHE.asEuint32(0);
    }

    function _requireInitialized(euint32 x, string memory tag) internal pure {
        if (!FHE.isInitialized(x)) revert(string(abi.encodePacked(tag, " not initialized")));
    }
}