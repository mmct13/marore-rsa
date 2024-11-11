const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const forge = require("node-forge");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Autorise toutes les origines
    methods: ["GET", "POST"],
  },
});

const chatLogFile = "chatlog.txt";
const users = new Map();

// Fonction pour générer une paire de clés RSA avec des paramètres spécifiques
function generateKeyPair() {
  const rsa = forge.pki.rsa;
  const keypair = rsa.generateKeyPair(2048);
  return keypair;
}

// Fonction pour chiffrer un message avec padding OAEP
function encryptMessage(publicKey, message) {
  try {
    const encrypted = publicKey.encrypt(message, "RSA-OAEP");
    return forge.util.encode64(encrypted);
  } catch (error) {
    console.error("Erreur de chiffrement:", error);
    return null;
  }
}

function logMessage(username, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${username || "Anonymous"}: ${message}\n`;

  fs.appendFile(chatLogFile, logMessage, (err) => {
    if (err) console.error("Erreur d'écriture dans le fichier de log:", err);
  });
}

io.on("connection", (socket) => {
  console.log("Utilisateur connecté:", socket.id);

  // Générer les clés pour le nouvel utilisateur
  const { publicKey, privateKey } = generateKeyPair();

  // Stocker les informations de l'utilisateur
  users.set(socket.id, {
    publicKey,
    privateKey,
    username: null,
  });

  // Envoyer les clés au client
  socket.emit("keys", {
    publicKey: forge.pki.publicKeyToPem(publicKey),
    privateKey: forge.pki.privateKeyToPem(privateKey),
  });

  socket.on("setUsername", (username) => {
    if (typeof username !== "string" || username.length < 1) {
      socket.emit("error", "Nom d'utilisateur invalide");
      return;
    }

    const userInfo = users.get(socket.id);
    if (userInfo) {
      userInfo.username = username;
      console.log(`${username} a rejoint le chat`);
      socket.broadcast.emit("userJoined", username);
    }
  });

  socket.on("message", (msg) => {
    const sender = users.get(socket.id);
    if (!sender || !sender.username) {
      socket.emit("error", "Veuillez définir un nom d'utilisateur");
      return;
    }

    if (typeof msg !== "string" || msg.length < 1) {
      socket.emit("error", "Message invalide");
      return;
    }

    console.log(`Message reçu de ${sender.username}: ${msg}`);
    logMessage(sender.username, msg);

    // Chiffrer et envoyer le message pour chaque utilisateur
    for (const [recipientId, recipient] of users) {
      try {
        const encryptedMessage = encryptMessage(recipient.publicKey, msg);
        if (encryptedMessage) {
          io.to(recipientId).emit("message", {
            encryptedMessage,
            sender: sender.username,
            timestamp: Date.now(),
            originalMessage: recipientId === socket.id ? msg : undefined,
          });
        }
      } catch (error) {
        console.error(`Erreur d'envoi pour ${recipientId}:`, error);
      }
    }
  });

  socket.on("disconnect", () => {
    const userInfo = users.get(socket.id);
    if (userInfo && userInfo.username) {
      console.log(`${userInfo.username} s'est déconnecté`);
      socket.broadcast.emit("userLeft", userInfo.username);
    }
    users.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Serveur Socket.IO démarré sur http://localhost:${PORT}`);
});
