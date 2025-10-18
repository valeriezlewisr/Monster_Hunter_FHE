# RPG with Encrypted Monster Stats & Weaknesses

Dive into a thrilling adventure in "RPG with Encrypted Monster Stats & Weaknesses," a unique role-playing game powered by **Zama's Fully Homomorphic Encryption technology**. In this game, players will engage in epic battles with monsters, where their attributes, resistances, and weaknesses are encrypted, pushing players to strategize and observe their opponents rather than relying on walkthroughs. 

## The Problem

Traditional RPGs often provide an overwhelming amount of information about enemies, which can dilute the challenge and excitement of discovery. Players may rely on external guides to succeed, reducing the game's depth and engagement. This can lead to a repetitive gameplay experience and diminish the thrill of mastering the game through exploration and observation.

## The FHE Solution

Our game addresses these challenges with a revolutionary approach. By implementing **Zama's Fully Homomorphic Encryption (FHE)**, we ensure that crucial gameplay information, such as monster stats and weaknesses, is kept confidential. Players must engage with the combat system and use their skills to deduce their enemies' vulnerabilities based on encrypted data. This design encourages deeper interaction with the game mechanics while maintaining the integrity of sensitive information. The encryption is facilitated using Zama's open-source libraries, including **Concrete** and **TFHE-rs**, which allow for secure computations without compromising data.

## Key Features

- **Encrypted Attributes**: Monster strengths, weaknesses, and resistances are encrypted, challenging players to analyze behaviors instead of static data.
- **Dynamic Combat Mechanics**: Players' attacks yield encrypted damage results, making each encounter unpredictable and exciting.
- **Research & Learning**: Encourage players to observe and experiment with various attack strategies, promoting a richer gaming experience.
- **Third-Person Battle Interface**: Players can immerse themselves in the action, enhancing the visual and interactive elements of gameplay.
- **Comprehensive Monster Codex**: Players can unlock an in-game monster encyclopedia providing hints based on player performance.

## Technology Stack

- **Zama SDK (Concrete, TFHE-rs)**: The backbone of our game's encryption, enabling secure computations.
- **Unity**: For game development and rendering.
- **Node.js**: For server-side logic and database management.
- **Hardhat**: For smart contract development and testing.

## Directory Structure

Here's the structure of the project files:

```
/RPG_with_Encrypted_Monster_Stats_&_Weaknesses
│
├── contracts
│   └── Monster_Hunter_FHE.sol
│
├── src
│   ├── gameLogic.js
│   ├── monsterData.js
│   └── database.js
│
├── test
│   └── monsterTest.js
│
├── package.json
└── README.md
```

## Installation Guide

To set up the project on your local machine, please follow these steps:

1. **Ensure you have Node.js installed.** If you haven't done this, please refer to the Node.js official documentation for installation instructions.
2. **Download the project files** and navigate to the project directory.
3. **Run the following command to install the necessary dependencies:**
   ```bash
   npm install
   ```
   This command will fetch all required packages, including Zama FHE libraries.

## Build & Run Guide

To compile, test, and run the game, use the following commands:

1. **Compile the smart contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run the tests to ensure everything works correctly**:
   ```bash
   npx hardhat test
   ```

3. **Start the game**:
   ```bash
   node src/gameLogic.js
   ```

## Usage Example

Here's a brief code snippet demonstrating how the game retrieves encrypted monster stats:

```javascript
const { encryptStats } = require('./monsterData');

const monster = {
    name: "Giant Spider",
    strength: 80,
    weakness: "Fire"
};

// Encrypting monster stats
const encryptedStats = encryptStats(monster);
console.log("Encrypted Monster Stats: ", encryptedStats);
// Players will need to decipher these stats through gameplay!
```

## Acknowledgements

This project is made possible thanks to the pioneering work by the **Zama team**. Their innovative open-source tools empower developers to create secure, confidential blockchain applications, providing a solid foundation for projects like ours. Thank you for enabling us to push the boundaries of gaming experiences while protecting sensitive data!
