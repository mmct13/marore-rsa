// Importation des modules nécessaires
const express = require("express"); // Framework web pour Node.js
const { createServer } = require("http"); // Permet de créer un serveur HTTP
const { Server } = require("socket.io"); // Socket.IO pour les communications en temps réel
const fs = require("fs"); // Module pour manipuler le système de fichiers
const forge = require("node-forge"); // Bibliothèque pour les opérations cryptographiques

// Initialisation de l'application Express et du serveur HTTP
const app = express();
const httpServer = createServer(app);

// Configuration de Socket.IO avec CORS
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Autorise toutes les origines pour éviter les problèmes CORS
    methods: ["GET", "POST"], // Méthodes HTTP autorisées
  },
});

const chatLogFile = "chatlog.txt"; // Nom du fichier pour stocker les logs du chat
const users = new Map(); // Map pour stocker les informations des utilisateurs connectés

// Fonction pour générer une paire de clés RSA
function generateKeyPair() {
  const rsa = forge.pki.rsa;
  const keypair = rsa.generateKeyPair(2048); // Génération avec une taille de clé de 2048 bits
  return keypair;
}

// Fonction pour chiffrer un message en utilisant la clé publique du destinataire
function encryptMessage(publicKey, message) {
  try {
    const encrypted = publicKey.encrypt(message, "RSA-OAEP"); // Chiffrement avec padding OAEP
    return forge.util.encode64(encrypted); // Encodage en base64 pour transmission
  } catch (error) {
    console.error("Erreur de chiffrement:", error);
    return null;
  }
}

// Fonction pour enregistrer un message dans le fichier de log
function logMessage(username, message) {
  const timestamp = new Date().toISOString(); // Timestamp au format ISO
  const logMessage = `[${timestamp}] ${username || "Anonymous"}: ${message}\n`; // Formatage du message

  // Ajout du message au fichier
  fs.appendFile(chatLogFile, logMessage, (err) => {
    if (err) console.error("Erreur d'écriture dans le fichier de log:", err);
  });
}

// Gestion des connexions des clients
io.on("connection", (socket) => {
  console.log("Utilisateur connecté:", socket.id);

  // Générer une paire de clés pour l'utilisateur connecté
  const { publicKey, privateKey } = generateKeyPair();

  // Stocker les clés et infos utilisateur dans la Map
  users.set(socket.id, {
    publicKey,
    privateKey,
    publicKey,
    username: null, // Nom d'utilisateur initialement non défini
  });

  // Envoi des clés RSA générées au client
  socket.emit("keys", {
    publicKey: forge.pki.publicKeyToPem(publicKey), // Conversion en format PEM pour transport
    privateKey: forge.pki.privateKeyToPem(privateKey),
  });

  // Gestion de la définition du nom d'utilisateur
  socket.on("setUsername", (username) => {
    if (typeof username !== "string" || username.length < 1) {
      socket.emit("error", "Nom d'utilisateur invalide"); // Erreur si le nom est invalide
      return;
    }

    const userInfo = users.get(socket.id);
    if (userInfo) {
      userInfo.username = username; // Mise à jour du nom d'utilisateur
      console.log(`${username} a rejoint le chat avec la clé publique ${userInfo.publicKey.n}`);
      socket.broadcast.emit("userJoined", username); // Informer les autres utilisateurs
    }
  });

  // Gestion de la réception d'un message
  socket.on("message", (msg) => {
    const sender = users.get(socket.id);
    if (!sender || !sender.username) {
      socket.emit("error", "Veuillez définir un nom d'utilisateur"); // Erreur si l'utilisateur n'est pas identifié
      return;
    }

    if (typeof msg !== "string" || msg.length < 1) {
      socket.emit("error", "Message invalide"); // Erreur si le message est vide
      return;
    }

    console.log(`Message reçu de ${sender.username}: ${msg}`);
    logMessage(sender.username, msg); // Enregistrement du message dans le log

    // Diffuser le message chiffré à tous les utilisateurs connectés
    for (const [recipientId, recipient] of users) {
      try {
        const encryptedMessage = encryptMessage(recipient.publicKey, msg);
        if (encryptedMessage) {
          io.to(recipientId).emit("message", {
            encryptedMessage,
            sender: sender.username,
            timestamp: Date.now(),
            originalMessage: recipientId === socket.id ? msg : undefined, // Envoyer le message en clair à l'expéditeur uniquement
          });
        }
      } catch (error) {
        console.error(`Erreur d'envoi pour ${recipientId}:`, error);
      }
    }
  });

  // Gestion de la déconnexion d'un utilisateur
  socket.on("disconnect", () => {
    const userInfo = users.get(socket.id);
    if (userInfo && userInfo.username) {
      console.log(`${userInfo.username} s'est déconnecté`);
      socket.broadcast.emit("userLeft", userInfo.username); // Informer les autres de la déconnexion
    }
    users.delete(socket.id); // Supprimer les infos utilisateur de la Map
  });
});

// Démarrage du serveur HTTP sur un port spécifique
const PORT = process.env.PORT || 3001; // Port configurable via une variable d'environnement
httpServer.listen(PORT, () => {
  console.log(`Serveur Socket.IO démarré sur http://localhost:${PORT}`);
});
