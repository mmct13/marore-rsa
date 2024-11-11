"use client";
import { useEffect, useState, useCallback } from "react";
import io from "socket.io-client";
import forge from "node-forge";

const SOCKET_URL = "http://192.168.1.8:3001" || "http://localhost:3001";
const socket = io(SOCKET_URL);

const generateRedShade = () => {
  // Générer des teintes de rouge variées
  const hue = 0; // Rouge
  const saturation = 60 + Math.random() * 20; // 60-80%
  const lightness = 75 + Math.random() * 15; // 75-90%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const userColors = new Map();

export default function Chat() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [privateKey, setPrivateKey] = useState(null);
  const [isUsernameSet, setIsUsernameSet] = useState(false);
  const [error, setError] = useState(null);
  const [connectedUsers, setConnectedUsers] = useState(new Map());

  // Fonctions de chiffrement restent inchangées
  const importPrivateKey = useCallback((pemKey) => {
    try {
      const pemHeader = "-----BEGIN PRIVATE KEY-----";
      const pemFooter = "-----END PRIVATE KEY-----";
      let pemContents = pemKey.replace(pemHeader, "").replace(pemFooter, "");
      pemContents = pemContents.replace(/\r?\n|\n/g, "").trim();
      const privateKey = forge.pki.privateKeyFromPem(pemContents);
      return privateKey;
    } catch (error) {
      console.error("Error importing private key:", error);
      setError("Erreur lors de l'importation de la clé privée");
      return null;
    }
  }, []);

  const decryptMessage = useCallback(
    (encryptedMessage) => {
      if (!privateKey) {
        throw new Error("Clé privée non disponible");
      }
      try {
        const encryptedBuffer = forge.util.decode64(encryptedMessage);
        const decryptedBuffer = privateKey.decrypt(encryptedBuffer, "RSA-OAEP");
        return decryptedBuffer;
      } catch (error) {
        console.error("Failed to decrypt message:", error);
        throw new Error("Erreur de déchiffrement");
      }
    },
    [privateKey]
  );

  useEffect(() => {
    const handleKeys = async ({ privateKey: pemKey }) => {
      try {
        const cryptoKey = importPrivateKey(pemKey);
        if (cryptoKey) {
          console.log("Clé privée importée avec succès");
          setPrivateKey(cryptoKey);
        }
      } catch (error) {
        console.error("Erreur lors de l'importation de la clé:", error);
        setError("Impossible d'importer la clé privée");
      }
    };

    socket.on("keys", handleKeys);

    socket.on(
      "message",
      ({ encryptedMessage, sender, timestamp, originalMessage }) => {
        if (!userColors.has(sender)) {
          userColors.set(sender, generateRedShade());
        }
        setMessages((prev) => [
          ...prev,
          {
            encryptedMessage,
            sender,
            timestamp,
            decrypted: originalMessage || null,
            color: userColors.get(sender),
          },
        ]);
      }
    );

    socket.on("error", (errorMessage) => {
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    });

    socket.on("userJoined", (newUsername) => {
      const color = generateRedShade();
      userColors.set(newUsername, color);
      setConnectedUsers((prev) => new Map(prev.set(newUsername, color)));
    });

    socket.on("userLeft", (leftUsername) => {
      setConnectedUsers((prev) => {
        const newMap = new Map(prev);
        newMap.delete(leftUsername);
        return newMap;
      });
    });

    return () => {
      socket.off("keys");
      socket.off("message");
      socket.off("error");
      socket.off("userJoined");
      socket.off("userLeft");
    };
  }, [importPrivateKey]);

  const handleSetUsername = (e) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (trimmedUsername) {
      socket.emit("setUsername", trimmedUsername);
      setIsUsernameSet(true);
      setError(null);
      userColors.set(trimmedUsername, generateRedShade());
    } else {
      setError("Le nom d'utilisateur ne peut pas être vide");
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    if (trimmedMessage) {
      socket.emit("message", trimmedMessage);
      setMessage("");
      setError(null);
    } else {
      setError("Le message ne peut pas être vide");
    }
  };

  const handleDecrypt = async (msg, index) => {
    try {
      const decrypted = await decryptMessage(msg.encryptedMessage);
      setMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, decrypted } : m))
      );
    } catch (error) {
      console.error("Erreur lors du déchiffrement:", error);
      setMessages((prev) =>
        prev.map((m, i) =>
          i === index ? { ...m, decrypted: "Erreur de déchiffrement" } : m
        )
      );
    }
  };

  const MessageContent = ({ msg, index }) => {
    const isSender = msg.sender === username;

    if (isSender) {
      return (
        <div className="text-sm break-words text-gray-100">{msg.decrypted}</div>
      );
    }

    return (
      <div className="text-sm">
        {msg.decrypted ? (
          <div className="break-words text-gray-100">{msg.decrypted}</div>
        ) : (
          <>
            <div className="text-xs text-gray-300 mb-1 break-all">
              {msg.encryptedMessage}
            </div>
            <button
              onClick={() => handleDecrypt(msg, index)}
              className="bg-red-600 text-white px-3 py-1.5 rounded-full text-xs hover:bg-red-700 transition-colors duration-200"
            >
              Déchiffrer
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 h-screen flex flex-col">
        {error && (
          <div className="bg-red-900/50 border-l-4 border-red-600 text-red-200 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {!isUsernameSet ? (
          <form
            onSubmit={handleSetUsername}
            className="space-y-4 max-w-md mx-auto w-full mt-12"
          >
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Entrez votre nom d'utilisateur"
              className="w-full p-3 bg-gray-900 border border-red-800 text-white rounded-xl focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all duration-200"
              maxLength={50}
            />
            <button
              type="submit"
              className="w-full bg-red-600 text-white px-6 py-3 rounded-xl hover:bg-red-700 transition-all duration-200 shadow-lg shadow-red-900/20"
            >
              Définir le nom d'utilisateur
            </button>
          </form>
        ) : (
          <div className="flex-1 flex flex-col space-y-4 h-full max-h-[calc(100vh-8rem)]">
            <div className="bg-gray-900 p-4 rounded-xl shadow-lg shadow-red-900/10">
              <h2 className="font-semibold text-red-400 mb-2 text-sm">
                Utilisateurs connectés :
              </h2>
              <div className="flex flex-wrap gap-2">
                {Array.from(connectedUsers.entries()).map(([user, color]) => (
                  <span
                    key={user}
                    className="px-3 py-1 rounded-full text-sm shadow-sm"
                    style={{ backgroundColor: color, color: "#1a1a1a" }}
                  >
                    {user}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col bg-gray-900 rounded-xl shadow-lg shadow-red-900/10 border border-red-900/20">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-xl shadow-md max-w-[85%] sm:max-w-[75%] ${
                      msg.sender === username ? "ml-auto" : "mr-auto"
                    }`}
                    style={{
                      backgroundColor:
                        msg.sender === username ? "#4a0000" : "#2a0000",
                    }}
                  >
                    <div className="font-semibold text-red-300 text-sm">
                      {msg.sender}
                    </div>
                    <MessageContent msg={msg} index={index} />
                    <div className="text-xs text-red-300/70 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={sendMessage}
                className="p-4 border-t border-red-900/20"
              >
                <div className="flex gap-2 sm:gap-3">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tapez votre message..."
                    className="flex-1 p-2 sm:p-3 bg-gray-800 text-white border border-red-800 rounded-xl focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all duration-200"
                    maxLength={1000}
                  />
                  <button
                    type="submit"
                    className="bg-red-600 text-white text-xs sm:text-base px-2 sm:px-6 py-2 sm:py-3 rounded-xl hover:bg-red-700 transition-colors duration-200 whitespace-nowrap shadow-lg shadow-red-900/20"
                  >
                    Envoyer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
