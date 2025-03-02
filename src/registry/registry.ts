import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";
import { generateRsaKeyPair } from "../crypto";

export type Node = { nodeId: number; pubKey: string; pvKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  publicKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

const nodeRegistry: Node[] = [];

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  _registry.get("/status", (_req, res) => {
    res.send("live");
  });

  _registry.post("/registerNode", async (req: Request, res: Response) => {
    const { nodeId, publicKey, privateKey } = req.body as RegisterNodeBody & { privateKey: string };

    if (nodeRegistry.some((node) => node.pubKey === publicKey)) {
      res.status(400).json({ error: "Public key must be unique" });
    }

    nodeRegistry.push({ nodeId, pubKey: publicKey, pvKey: privateKey });
    res.status(200).json({ message: "Node registered successfully" });
  });

  _registry.get("/getPrivateKey", (req: Request, res: Response) => {
    const { nodeId } = req.query as { nodeId: string };
    const node = nodeRegistry.find((node) => node.nodeId === Number(nodeId));

    if (!node) {
      res.status(404).json({ error: "Node not found" });
    }else{
      res.json({ result: node.pvKey });
    }
  });

  _registry.get("/getNodeRegistry", (_req, res: Response) => {
    const nodes = nodeRegistry.map(({ nodeId, pubKey }) => ({ nodeId, pubKey }));
    res.json({ nodes });
  });





  // Génération de la clé RSA (si nécessaire)
  const { publicKey, privateKey } = await generateRsaKeyPair();

  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`Registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}