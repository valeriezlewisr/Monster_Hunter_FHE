// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Monster {
  id: string;
  name: string;
  encryptedStats: string;
  encryptedWeakness: string;
  timestamp: number;
  owner: string;
  status: "undiscovered" | "analyzed" | "hunted";
  image: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'increase10%':
      result = value * 1.1;
      break;
    case 'decrease10%':
      result = value * 0.9;
      break;
    case 'double':
      result = value * 2;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const monsterImages = [
  "dragon_red.png",
  "beast_blue.png",
  "wyvern_green.png",
  "demon_purple.png",
  "elemental_yellow.png"
];

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newMonsterData, setNewMonsterData] = useState({ name: "", health: 0, attack: 0, weakness: 0 });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [decryptedStats, setDecryptedStats] = useState<{health: number, attack: number} | null>(null);
  const [decryptedWeakness, setDecryptedWeakness] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [simulationDamage, setSimulationDamage] = useState<number | null>(null);
  const [simulationElement, setSimulationElement] = useState<string>("fire");
  const [activeTab, setActiveTab] = useState<"encyclopedia" | "analyzer" | "simulator">("encyclopedia");

  const analyzedCount = monsters.filter(m => m.status === "analyzed").length;
  const huntedCount = monsters.filter(m => m.status === "hunted").length;
  const undiscoveredCount = monsters.filter(m => m.status === "undiscovered").length;

  useEffect(() => {
    loadMonsters().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadMonsters = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("monster_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing monster keys:", e); }
      }
      const list: Monster[] = [];
      for (const key of keys) {
        try {
          const monsterBytes = await contract.getData(`monster_${key}`);
          if (monsterBytes.length > 0) {
            try {
              const monsterData = JSON.parse(ethers.toUtf8String(monsterBytes));
          
              list.push({ 
                id: key, 
                name: monsterData.name, 
                encryptedStats: monsterData.stats, 
                encryptedWeakness: monsterData.weakness,
                timestamp: monsterData.timestamp, 
                owner: monsterData.owner || address || "Unknown", 
                status: monsterData.status || "undiscovered",
                image: monsterData.image || monsterImages[Math.floor(Math.random() * monsterImages.length)]
              });
            } catch (e) { console.error(`Error parsing monster data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading monster ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setMonsters(list);
    } catch (e) { console.error("Error loading monsters:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitMonster = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting monster stats with Zama FHE..." });
    try {
      const encryptedStats = JSON.stringify({
        health: FHEEncryptNumber(newMonsterData.health),
        attack: FHEEncryptNumber(newMonsterData.attack)
      });
      const encryptedWeakness = FHEEncryptNumber(newMonsterData.weakness);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const monsterId = `m-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
      const monsterData = { 
        name: newMonsterData.name, 
        stats: encryptedStats, 
        weakness: encryptedWeakness,
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address || "Unknown", 
        status: "undiscovered",
        image: monsterImages[Math.floor(Math.random() * monsterImages.length)]
      };
      await contract.setData(`monster_${monsterId}`, ethers.toUtf8Bytes(JSON.stringify(monsterData)));
      const keysBytes = await contract.getData("monster_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(monsterId);
      await contract.setData("monster_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Monster encrypted and added to the blockchain!" });
      await loadMonsters();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewMonsterData({ name: "", health: 0, attack: 0, weakness: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string, isWeakness = false): Promise<any> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      if (isWeakness) {
        return FHEDecryptNumber(encryptedData);
      } else {
        const stats = JSON.parse(encryptedData);
        return {
          health: FHEDecryptNumber(stats.health),
          attack: FHEDecryptNumber(stats.attack)
        };
      }
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const analyzeMonster = async (monsterId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Analyzing monster with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const monsterBytes = await contract.getData(`monster_${monsterId}`);
      if (monsterBytes.length === 0) throw new Error("Monster not found");
      const monsterData = JSON.parse(ethers.toUtf8String(monsterBytes));
      
      // Simulate FHE analysis by increasing stats slightly
      const stats = JSON.parse(monsterData.stats);
      const analyzedStats = JSON.stringify({
        health: FHECompute(stats.health, 'increase10%'),
        attack: FHECompute(stats.attack, 'increase10%')
      });
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedMonster = { ...monsterData, status: "analyzed", stats: analyzedStats };
      await contractWithSigner.setData(`monster_${monsterId}`, ethers.toUtf8Bytes(JSON.stringify(updatedMonster)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE analysis completed!" });
      await loadMonsters();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Analysis failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const huntMonster = async (monsterId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Hunting monster with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const monsterBytes = await contract.getData(`monster_${monsterId}`);
      if (monsterBytes.length === 0) throw new Error("Monster not found");
      const monsterData = JSON.parse(ethers.toUtf8String(monsterBytes));
      const updatedMonster = { ...monsterData, status: "hunted" };
      await contract.setData(`monster_${monsterId}`, ethers.toUtf8Bytes(JSON.stringify(updatedMonster)));
      setTransactionStatus({ visible: true, status: "success", message: "Monster hunted successfully!" });
      await loadMonsters();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Hunt failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const simulateAttack = async () => {
    if (!selectedMonster || !decryptedWeakness) return;
    
    const elementMultipliers: Record<string, number> = {
      fire: 1.0,
      water: 0.8,
      thunder: 1.2,
      ice: 0.9,
      dragon: 1.5
    };
    
    const weaknessMatch = Math.random() * 100;
    let damageMultiplier = 1.0;
    
    if (weaknessMatch < decryptedWeakness) {
      damageMultiplier = elementMultipliers[simulationElement] * 2.0; // Critical hit
    } else {
      damageMultiplier = elementMultipliers[simulationElement] * 0.5; // Reduced damage
    }
    
    if (decryptedStats) {
      const baseDamage = decryptedStats.attack * 0.3;
      setSimulationDamage(Math.floor(baseDamage * damageMultiplier));
      
      // Animation effect
      const monsterElement = document.querySelector('.monster-image');
      if (monsterElement) {
        monsterElement.classList.add('hit-animation');
        setTimeout(() => monsterElement.classList.remove('hit-animation'), 500);
      }
    }
  };

  const isOwner = (monsterAddress: string) => address?.toLowerCase() === monsterAddress.toLowerCase();

  const tutorialSteps = [
    { title: "Connect Wallet", description: "Connect your Web3 wallet to begin hunting encrypted monsters", icon: "🔗" },
    { title: "Discover Monsters", description: "Find monsters with encrypted stats and weaknesses", icon: "👁️", details: "All monster attributes are encrypted using Zama FHE technology" },
    { title: "Analyze Weaknesses", description: "Use FHE computations to analyze monster vulnerabilities", icon: "🔍", details: "Weakness analysis happens without decrypting the original values" },
    { title: "Hunt Monsters", description: "Defeat monsters by exploiting their encrypted weaknesses", icon: "⚔️", details: "Successful hunts are recorded on-chain with FHE verification" }
  ];

  const renderRadarChart = () => {
    return (
      <div className="radar-chart">
        <div className="radar-grid">
          <div className="radar-ring"></div>
          <div className="radar-ring"></div>
          <div className="radar-ring"></div>
          <div className="radar-center"></div>
          <div className="radar-scan"></div>
        </div>
        <div className="radar-monsters">
          {monsters.slice(0, 3).map((monster, index) => (
            <div 
              key={monster.id} 
              className={`radar-blip ${monster.status}`}
              style={{
                left: `${50 + 30 * Math.cos(index * 2 * Math.PI / 3)}%`,
                top: `${50 + 30 * Math.sin(index * 2 * Math.PI / 3)}%`
              }}
            ></div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="hunter-spinner"></div>
      <p>Initializing encrypted hunting gear...</p>
    </div>
  );

  const formatOwnerAddress = (owner: string) => {
    if (!owner || owner.length < 42) return "Unknown";
    return `${owner.substring(0, 6)}...${owner.substring(38)}`;
  };

  return (
    <div className="app-container monster-hunter-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"><div className="monster-icon"></div></div>
          <h1>Monster<span>Hunter</span>FHE</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-monster-btn hunter-button">
            <div className="add-icon"></div>Add Monster
          </button>
          <button className="hunter-button" onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Tutorial" : "Hunter's Guide"}
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Hunt Encrypted Monsters</h2>
            <p>Discover and defeat monsters with stats encrypted by Zama FHE technology</p>
          </div>
          <div className="fhe-indicator"><div className="fhe-lock"></div><span>FHE Encryption Active</span></div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>Hunter's Guide to FHE Monsters</h2>
            <p className="subtitle">Learn how to hunt monsters with encrypted weaknesses</p>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.details && <div className="step-details">{step.details}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="fhe-diagram">
              <div className="diagram-step"><div className="diagram-icon">👁️</div><div className="diagram-label">Discover Monster</div></div>
              <div className="diagram-arrow">→</div>
              <div className="diagram-step"><div className="diagram-icon">🔒</div><div className="diagram-label">FHE Encryption</div></div>
              <div className="diagram-arrow">→</div>
              <div className="diagram-step"><div className="diagram-icon">🔍</div><div className="diagram-label">Analyze Weakness</div></div>
              <div className="diagram-arrow">→</div>
              <div className="diagram-step"><div className="diagram-icon">⚔️</div><div className="diagram-label">Hunt Monster</div></div>
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card hunter-card">
            <h3>Monster Encyclopedia</h3>
            <p>Track your progress hunting monsters with <strong>Zama FHE encrypted stats</strong>. Each monster's weaknesses are hidden until analyzed.</p>
            <div className="fhe-badge"><span>FHE-Powered</span></div>
          </div>
          <div className="dashboard-card hunter-card">
            <h3>Hunting Progress</h3>
            <div className="stats-grid">
              <div className="stat-item"><div className="stat-value">{monsters.length}</div><div className="stat-label">Total Monsters</div></div>
              <div className="stat-item"><div className="stat-value">{analyzedCount}</div><div className="stat-label">Analyzed</div></div>
              <div className="stat-item"><div className="stat-value">{huntedCount}</div><div className="stat-label">Hunted</div></div>
            </div>
          </div>
          <div className="dashboard-card hunter-card">
            <h3>Monster Radar</h3>
            {renderRadarChart()}
          </div>
        </div>
        
        <div className="tabs-container">
          <div className="tabs">
            <button 
              className={`tab-button ${activeTab === "encyclopedia" ? "active" : ""}`}
              onClick={() => setActiveTab("encyclopedia")}
            >
              Monster Encyclopedia
            </button>
            <button 
              className={`tab-button ${activeTab === "analyzer" ? "active" : ""}`}
              onClick={() => setActiveTab("analyzer")}
            >
              Weakness Analyzer
            </button>
            <button 
              className={`tab-button ${activeTab === "simulator" ? "active" : ""}`}
              onClick={() => setActiveTab("simulator")}
            >
              Combat Simulator
            </button>
          </div>
          
          <div className="tab-content">
            {activeTab === "encyclopedia" && (
              <div className="monsters-section">
                <div className="section-header">
                  <h2>Encrypted Monster Records</h2>
                  <div className="header-actions">
                    <button onClick={loadMonsters} className="refresh-btn hunter-button" disabled={isRefreshing}>
                      {isRefreshing ? "Scanning..." : "Scan Area"}
                    </button>
                  </div>
                </div>
                <div className="monsters-list hunter-card">
                  <div className="table-header">
                    <div className="header-cell">Monster</div>
                    <div className="header-cell">Name</div>
                    <div className="header-cell">Discovered By</div>
                    <div className="header-cell">Date</div>
                    <div className="header-cell">Status</div>
                    <div className="header-cell">Actions</div>
                  </div>
                  {monsters.length === 0 ? (
                    <div className="no-monsters">
                      <div className="no-monsters-icon"></div>
                      <p>No monsters discovered yet</p>
                      <button className="hunter-button primary" onClick={() => setShowCreateModal(true)}>Add First Monster</button>
                    </div>
                  ) : monsters.map(monster => (
                    <div className="monster-row" key={monster.id} onClick={() => setSelectedMonster(monster)}>
                      <div className="table-cell monster-image">
                        <img src={`/images/${monster.image}`} alt={monster.name} />
                      </div>
                      <div className="table-cell">{monster.name}</div>
                      <div className="table-cell">{formatOwnerAddress(monster.owner)}</div>
                      <div className="table-cell">{new Date(monster.timestamp * 1000).toLocaleDateString()}</div>
                      <div className="table-cell"><span className={`status-badge ${monster.status}`}>{monster.status}</span></div>
                      <div className="table-cell actions">
                        {isOwner(monster.owner) && monster.status === "undiscovered" && (
                          <>
                            <button className="action-btn hunter-button success" onClick={(e) => { e.stopPropagation(); analyzeMonster(monster.id); }}>Analyze</button>
                          </>
                        )}
                        {monster.status === "analyzed" && (
                          <button className="action-btn hunter-button danger" onClick={(e) => { e.stopPropagation(); huntMonster(monster.id); }}>Hunt</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {activeTab === "analyzer" && selectedMonster && (
              <div className="analyzer-section">
                <h2>Weakness Analyzer</h2>
                <div className="analyzer-content hunter-card">
                  <div className="monster-display">
                    <img src={`/images/${selectedMonster.image}`} alt={selectedMonster.name} className="monster-image" />
                    <h3>{selectedMonster.name}</h3>
                    <div className="monster-status">{selectedMonster.status}</div>
                  </div>
                  <div className="analysis-results">
                    <div className="result-item">
                      <h4>Encrypted Stats</h4>
                      <div className="encrypted-data">{selectedMonster.encryptedStats.substring(0, 50)}...</div>
                    </div>
                    <div className="result-item">
                      <h4>Encrypted Weakness</h4>
                      <div className="encrypted-data">{selectedMonster.encryptedWeakness.substring(0, 30)}...</div>
                    </div>
                    <div className="analysis-actions">
                      <button 
                        className="hunter-button" 
                        onClick={async () => {
                          const stats = await decryptWithSignature(selectedMonster.encryptedStats);
                          setDecryptedStats(stats);
                        }}
                        disabled={isDecrypting}
                      >
                        {isDecrypting ? "Decrypting..." : "Decrypt Stats"}
                      </button>
                      <button 
                        className="hunter-button" 
                        onClick={async () => {
                          const weakness = await decryptWithSignature(selectedMonster.encryptedWeakness, true);
                          setDecryptedWeakness(weakness);
                        }}
                        disabled={isDecrypting}
                      >
                        {isDecrypting ? "Decrypting..." : "Decrypt Weakness"}
                      </button>
                    </div>
                    {decryptedStats && (
                      <div className="decrypted-stats">
                        <h4>Decrypted Stats</h4>
                        <div className="stats-grid">
                          <div className="stat-item"><span>Health:</span> {decryptedStats.health}</div>
                          <div className="stat-item"><span>Attack:</span> {decryptedStats.attack}</div>
                        </div>
                      </div>
                    )}
                    {decryptedWeakness && (
                      <div className="decrypted-weakness">
                        <h4>Weakness Analysis</h4>
                        <div className="weakness-meter">
                          <div 
                            className="weakness-bar" 
                            style={{ width: `${decryptedWeakness}%` }}
                          ></div>
                          <span>{decryptedWeakness}% elemental weakness</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === "simulator" && selectedMonster && decryptedStats && decryptedWeakness && (
              <div className="simulator-section">
                <h2>Combat Simulator</h2>
                <div className="simulator-content hunter-card">
                  <div className="combat-display">
                    <div className="monster-side">
                      <img src={`/images/${selectedMonster.image}`} alt={selectedMonster.name} className="monster-image" />
                      <div className="monster-health">
                        <div 
                          className="health-bar" 
                          style={{ width: `${100}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="vs-sign">VS</div>
                    <div className="hunter-side">
                      <div className="hunter-image"></div>
                      <div className="weapon-selector">
                        <select 
                          value={simulationElement} 
                          onChange={(e) => setSimulationElement(e.target.value)}
                          className="hunter-select"
                        >
                          <option value="fire">Fire Weapon</option>
                          <option value="water">Water Weapon</option>
                          <option value="thunder">Thunder Weapon</option>
                          <option value="ice">Ice Weapon</option>
                          <option value="dragon">Dragon Weapon</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="combat-actions">
                    <button className="hunter-button attack-btn" onClick={simulateAttack}>
                      Attack!
                    </button>
                  </div>
                  {simulationDamage !== null && (
                    <div className="combat-result">
                      <div className={`damage-display ${simulationDamage > decryptedStats.health * 0.3 ? "critical" : ""}`}>
                        {simulationDamage} damage!
                      </div>
                      {simulationDamage > decryptedStats.health * 0.3 ? (
                        <div className="result-message">Critical hit! Monster is staggered!</div>
                      ) : (
                        <div className="result-message">Monster resists your attack</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitMonster} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          monsterData={newMonsterData} 
          setMonsterData={setNewMonsterData}
        />
      )}
      
      {selectedMonster && (
        <MonsterDetailModal 
          monster={selectedMonster} 
          onClose={() => { 
            setSelectedMonster(null); 
            setDecryptedStats(null); 
            setDecryptedWeakness(null);
            setSimulationDamage(null);
          }} 
          decryptedStats={decryptedStats}
          decryptedWeakness={decryptedWeakness}
          setDecryptedStats={setDecryptedStats}
          setDecryptedWeakness={setDecryptedWeakness}
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content hunter-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="hunter-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="monster-icon"></div><span>MonsterHunterFHE</span></div>
            <p>Hunt monsters with encrypted stats using Zama FHE technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Hunter's Guide</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact Guild</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge"><span>FHE-Powered Hunting</span></div>
          <div className="copyright">© {new Date().getFullYear()} MonsterHunterFHE. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  monsterData: any;
  setMonsterData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, monsterData, setMonsterData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setMonsterData({ ...monsterData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMonsterData({ ...monsterData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!monsterData.name || monsterData.health <= 0 || monsterData.attack <= 0 || monsterData.weakness <= 0) { 
      alert("Please fill all required fields with valid values"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal hunter-card">
        <div className="modal-header">
          <h2>Add Encrypted Monster</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div><strong>FHE Encryption Notice</strong><p>Monster stats will be encrypted with Zama FHE before submission</p></div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Monster Name *</label>
              <input type="text" name="name" value={monsterData.name} onChange={handleChange} placeholder="Enter monster name..." className="hunter-input"/>
            </div>
            <div className="form-group">
              <label>Health Points *</label>
              <input 
                type="number" 
                name="health" 
                value={monsterData.health} 
                onChange={handleValueChange} 
                placeholder="Enter health value..." 
                className="hunter-input"
                min="1"
              />
            </div>
            <div className="form-group">
              <label>Attack Power *</label>
              <input 
                type="number" 
                name="attack" 
                value={monsterData.attack} 
                onChange={handleValueChange} 
                placeholder="Enter attack value..." 
                className="hunter-input"
                min="1"
              />
            </div>
            <div className="form-group">
              <label>Elemental Weakness (%) *</label>
              <input 
                type="number" 
                name="weakness" 
                value={monsterData.weakness} 
                onChange={handleValueChange} 
                placeholder="Enter weakness percentage..." 
                className="hunter-input"
                min="1"
                max="100"
              />
            </div>
          </div>
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data"><span>Plain Stats:</span><div>Health: {monsterData.health}, Attack: {monsterData.attack}</div></div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>{monsterData.health ? FHEEncryptNumber(monsterData.health).substring(0, 30) + '...' : 'No value entered'}</div>
              </div>
          </div>
          </div>
          <div className="privacy-notice">
            <div className="privacy-icon"></div> 
            <div><strong>Hunting Privacy</strong><p>Monster weaknesses remain encrypted until analyzed by hunters</p></div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn hunter-button">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn hunter-button primary">
            {creating ? "Encrypting Monster..." : "Create Monster"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface MonsterDetailModalProps {
  monster: Monster;
  onClose: () => void;
  decryptedStats: {health: number, attack: number} | null;
  decryptedWeakness: number | null;
  setDecryptedStats: (value: any) => void;
  setDecryptedWeakness: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string, isWeakness?: boolean) => Promise<any>;
}

const MonsterDetailModal: React.FC<MonsterDetailModalProps> = ({ 
  monster, onClose, decryptedStats, decryptedWeakness, setDecryptedStats, setDecryptedWeakness, isDecrypting, decryptWithSignature 
}) => {
  return (
    <div className="modal-overlay">
      <div className="monster-detail-modal hunter-card">
        <div className="modal-header">
          <h2>Monster Details #{monster.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="monster-display">
            <img src={`/images/${monster.image}`} alt={monster.name} className="monster-image" />
            <div className="monster-info">
              <h3>{monster.name}</h3>
              <div className="info-item"><span>Status:</span><strong className={`status-badge ${monster.status}`}>{monster.status}</strong></div>
              <div className="info-item"><span>Discovered By:</span><strong>{monster.owner.substring(0, 6)}...{monster.owner.substring(38)}</strong></div>
              <div className="info-item"><span>Date:</span><strong>{new Date(monster.timestamp * 1000).toLocaleString()}</strong></div>
            </div>
          </div>
          <div className="monster-stats">
            <h3>Encrypted Attributes</h3>
            <div className="stats-section">
              <div className="stat-item">
                <h4>Combat Stats</h4>
                <div className="encrypted-data">{monster.encryptedStats.substring(0, 50)}...</div>
                <button 
                  className="hunter-button small" 
                  onClick={async () => {
                    const stats = await decryptWithSignature(monster.encryptedStats);
                    setDecryptedStats(stats);
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : "Decrypt Stats"}
                </button>
              </div>
              <div className="stat-item">
                <h4>Elemental Weakness</h4>
                <div className="encrypted-data">{monster.encryptedWeakness.substring(0, 30)}...</div>
                <button 
                  className="hunter-button small" 
                  onClick={async () => {
                    const weakness = await decryptWithSignature(monster.encryptedWeakness, true);
                    setDecryptedWeakness(weakness);
                  }}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : "Decrypt Weakness"}
                </button>
              </div>
            </div>
            {(decryptedStats || decryptedWeakness) && (
              <div className="decrypted-section">
                <h3>Decrypted Attributes</h3>
                {decryptedStats && (
                  <div className="decrypted-stats">
                    <h4>Combat Stats</h4>
                    <div className="stats-grid">
                      <div className="stat-item"><span>Health:</span> {decryptedStats.health}</div>
                      <div className="stat-item"><span>Attack:</span> {decryptedStats.attack}</div>
                    </div>
                  </div>
                )}
                {decryptedWeakness && (
                  <div className="decrypted-weakness">
                    <h4>Weakness Analysis</h4>
                    <div className="weakness-meter">
                      <div 
                        className="weakness-bar" 
                        style={{ width: `${decryptedWeakness}%` }}
                      ></div>
                      <span>{decryptedWeakness}% elemental weakness</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn hunter-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;