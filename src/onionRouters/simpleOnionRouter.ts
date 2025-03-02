import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT,REGISTRY_PORT } from "../config";
import axios from "axios";
import {exportPrvKey, exportPubKey, generateRsaKeyPair, importSymKey, rsaDecrypt, symDecrypt} from "../crypto";


export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());
  let lastReceivedEncryptedMessage : any = null;
  let lastReceivedDecryptedMessage : any = null;
  let lastMessageDestination : any = null;
  const port = BASE_ONION_ROUTER_PORT + nodeId;

  const { publicKey, privateKey } = await generateRsaKeyPair();
  const pubKey = await exportPubKey(publicKey);
  const prvKey = await exportPrvKey(privateKey);


  //register the onion router
  axios.post("http://localhost:" + REGISTRY_PORT + "/registerNode", {
    nodeId: nodeId,
    publicKey: pubKey,
    privateKey: prvKey,
  });

  onionRouter.get("/getPrivateKey", async (req, res) => {
    res.json({ result: prvKey });
  });





  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastMessageDestination });
  });

  onionRouter.post("/message", async (req, res) => {
    const { message } = req.body;

    // Split the message into encrypted symmetric key and encrypted message
    const [encryptedSymKey, encryptedMessage] = message.split(".");
    console.log(encryptedSymKey);

    // Decrypt the symmetric key with the private RSA key
    const symKeyString = await rsaDecrypt(encryptedSymKey, privateKey);
    console.log(symKeyString);
    /*
    // Import the symmetric key
    const symKey = await importSymKey(symKeyString);

    // Decrypt the message with the symmetric key
    const decryptedMessage = await symDecrypt(symKey, encryptedMessage);

    // Log the decrypted message
    console.log(decryptedMessage);
    */
    // Send response
    res.status(200).json({ message: "Message received successfully" });
  });


  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });

  return server;
}