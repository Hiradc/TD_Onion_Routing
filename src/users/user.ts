import bodyParser from "body-parser";
import express from "express";
import {BASE_ONION_ROUTER_PORT, BASE_USER_PORT, REGISTRY_PORT} from "../config";
import { webcrypto } from "crypto";
import {symEncrypt, rsaEncrypt, rsaDecrypt, symDecrypt, createRandomSymmetricKey, exportSymKey} from "../crypto";
import axios from "axios";
import {Node, RegisterNodeBody} from "@/src/registry/registry";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

export let destinationIdUser:number;
export let nodesSteps: Node[];

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());
  let lastReceivedMessage: any = null;
  let lastSentMessage: any = null;


  _user.get("/status", (req, res) => {
    res.send("live");
  });

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });


  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body as SendMessageBody;

    // create a random circuit of 3 distinct nodes with the help of the node registry
    const response = await axios.get<{ nodes: Node[] }>(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
    nodesSteps = response.data.nodes.sort(() => 0.5 - Math.random()).slice(0, 3);

    let destination = BASE_ONION_ROUTER_PORT + nodesSteps[1].nodeId + "";

    // adding 0 to destination to make it 10 characters long
    while (destination.length < 10) {
      destination = "0" + destination;
    }

    // concatenate the message with the destination

    let messageWithDestination = message + destination;

    // encrypt the message with a symmetric key
    const symKey = await createRandomSymmetricKey();
    const encryptedMessage = await symEncrypt(symKey, messageWithDestination);

    console.log("symKey in user:", await exportSymKey(symKey));
    // encrypt the symmetric key with the public key of the first node
    const encryptedSymKey = await rsaEncrypt(await exportSymKey(symKey), nodesSteps[0].pubKey);

    // concatenate the encrypted symmetric key with the encrypted message
    const messageToSend = encryptedSymKey + "." + encryptedMessage;

    // send the message to the first node
    await axios.post(`http://localhost:${BASE_ONION_ROUTER_PORT+nodesSteps[0].nodeId}/message`, {
      message: messageToSend
    });

    res.status(200).json({ message: "Message sent successfully" });

  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
        `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}