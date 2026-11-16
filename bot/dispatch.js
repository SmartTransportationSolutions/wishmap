// Ask the public wishmap repo to rebuild the map. Payload carries no wish data.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createGh } from "../lib/gh.js";

export async function dispatchRebuild({ gh, owner }) {
  await gh.rest("POST", `/repos/${owner}/wishmap/dispatches`, {
    event_type: "rebuild",
    client_payload: { nonce: randomUUID() },
  });
}

export async function main(env = process.env) {
  const owner = env.GITHUB_REPOSITORY.split("/")[0];
  if (!env.WISHMAP_DISPATCH_TOKEN) {
    console.log("no dispatch token; skipping rebuild");
    return;
  }
  await dispatchRebuild({ gh: createGh({ token: env.WISHMAP_DISPATCH_TOKEN }), owner });
  console.log("rebuild requested");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`dispatch failed: ${e.name} ${e.status ?? ""}`);
    process.exit(1);
  });
}
