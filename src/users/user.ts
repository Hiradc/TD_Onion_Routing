import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { createRandomSymmetricKey, exportSymKey, importPubKey, symEncrypt, rsaEncrypt} from "../crypto";
import { Node } from "../registry/registry";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

declare global {
  var lastReceivedMessage: string | null;
  var lastSentMessage: string | null;
  var lastCircuit: number[] | null;
}

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  if (!globalThis.lastReceivedMessage){
    globalThis.lastReceivedMessage = null;
  }
  if (!globalThis.lastSentMessage){
    globalThis.lastSentMessage = null;
  }
  if (!globalThis.lastCircuit){
    globalThis.lastCircuit = null;
  }

  _user.get("/status", (req, res) => {
    res.send("live");
  });

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: globalThis.lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: globalThis.lastSentMessage });
  });

  _user.post("/message", (req, res) => {
    const { message } = req.body;
    if (message === undefined || typeof message !== "string" ){
      res.status(400).json({ error: "Missing message" });
      return;
    } 
    globalThis.lastReceivedMessage = message;
    console.log(`lastReceivedMessage: ${globalThis.lastReceivedMessage}`)
    res.send("success");
  });

  _user.post("/sendMessage", async (req, res) => {
    try {
      const { message, destinationUserId }: SendMessageBody = req.body;

      const registryResponse = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
      const registryData = (await registryResponse.json()) as { nodes: Node[] }
      const availableNodes = registryData.nodes;

      if (availableNodes.length < 3) {
        res.status(500).json({ error: "Not enough nodes in the network" });
        return;
      }

      const shuffledNodes = availableNodes.sort(() => 0.5 - Math.random()).slice(0, 3);
      const circuit = shuffledNodes.map(node => node.nodeId);

      console.log("Selected circuit:", circuit);

      const symmetricKeys = await Promise.all(circuit.map(() => createRandomSymmetricKey()));

      let encryptedMessage = message;

      for (let i = 2; i >= 0; i--) {
        const nextDestination = i === 2 
          ? (BASE_USER_PORT + destinationUserId).toString() 
          : (BASE_ONION_ROUTER_PORT + circuit[i + 1]).toString();

        const formattedDestination = nextDestination.padStart(10, "0");

        encryptedMessage = await symEncrypt(symmetricKeys[i], formattedDestination + encryptedMessage);

        const base64SymetricKey = await exportSymKey(symmetricKeys[i])
        const encryptedSymKey = await rsaEncrypt(base64SymetricKey, shuffledNodes[i].pubKey);

        encryptedMessage = encryptedSymKey + encryptedMessage;
      }

      // Send the encrypted message to the first node
      const entryNode = circuit[0];
      const entryNodeUrl = `http://localhost:${BASE_ONION_ROUTER_PORT + entryNode}/message`;

      console.log("Sending to the first node:", entryNodeUrl);

      const response = await fetch(entryNodeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: encryptedMessage }),
      });

      if (!response.ok) {
        throw new Error(`Error sending message to the first node: ${response.status}`);
      }

      globalThis.lastSentMessage = message;
      globalThis.lastCircuit = circuit;
      res.json({ status: "Message sent successfully" });

    } catch (error) {
      console.error("Error while sending the message:", error);
      res.status(500).json({ error: "Internal error while sending the message" });
    }
  });

   // GET LastCircuit
  _user.get("/getLastCircuit", (req, res) => {
    res.json({ result: globalThis.lastCircuit });
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}
