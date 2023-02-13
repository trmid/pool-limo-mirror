import { create, CID } from 'ipfs-http-client';
import { ethers } from 'ethers';
import config from './config.json' assert { type: "json" };
import abi from './contractABI.json' assert { type: "json" };
import fs from 'fs';

const baseDir = '/pool';
const address = "0xf2C9E463592BD440f0D422E944E5F95c79404586";
const provider = new ethers.JsonRpcProvider(config.RPC_URL);
const contract = new ethers.Contract(address, abi, provider);
const client = create({ url: config.IPFS_API_URL });

const main = async () => {

  // Setup IPFS node file directory:
  console.log(`Setting up IPFS node directory...`);
  await client.files.mkdir(baseDir).then(() => console.log(`Created '${baseDir}' directory`)).catch(() => console.log(`'${baseDir}' exists`));

  // Query DataChanged events since last queried block:
  const lastQueriedBlock = config.LAST_QUERIED_BLOCK || 0;
  const blockNow = await provider.getBlockNumber();
  console.log(`Querying DataChanged events from block ${lastQueriedBlock} to ${blockNow}...`);
  const events = await contract.queryFilter("DataChanged", lastQueriedBlock, blockNow);
  let mirrored = 0;
  let tooLarge = 0;
  let failed = 0;
  let noContent = 0;
  let altContent = 0;
  let overriddenData = 0;

  // One-by-one in increasing block order, get transaction input data (name and new data) and add to map based on name.
  // This ensures we only consider the most recent data changes for a domain.
  const dataMap = new Map();
  for (let i = 0; i < events.length; i++) {
    try {
      const event = events[i];
      const tx = await event.getTransaction();
      const parsed = (new ethers.Interface(abi)).parseTransaction(tx);
      const name = parsed.args[0];
      const fields = parsed.args[1];
      console.log(`[${i + 1}/${events.length}] Found data update for:`, name, tx.hash);
      if(fields) {
        if(dataMap.has(name)) overriddenData++;
        dataMap.set(name, { fields: JSON.parse(fields), block: tx.blockNumber });
      } else {
        noContent++;
      }
    } catch(err) {
      console.error(err, tx.hash);
      failed++;
    }
  }

  // Loop through data changes:
  let dataIteration = 0;
  for(const [name, data] of dataMap) {
    const { fields, block } = data;
    if(fields.content) {
      try {

        // Get the total size of a site:
        const match = fields.content.match(/^(ipfs\:\/\/|\/ipfs\/)([a-zA-Z0-9]+)/);
        if(match) {
          const cid = CID.parse(match[2]);
          const src = `/ipfs/${cid}`;
          const { cumulativeSize } = await client.files.stat(src);

          // If less than max size, add to files at "/pool/{name}" (unpin old data if present):
          if(cumulativeSize > config.MAX_CONTENT_SIZE) {
            tooLarge++;
          } else {

            // Check if old data is present:
            const dir = `${baseDir}/${name}`;
            try {
              const ls = client.files.ls(dir);
              for await (const file of ls) {
                const filename = `${dir}/${file.name}`;
                const stat = await client.files.stat(filename);
                if(!filename.endsWith('-nopin')) {
                  await client.pin.rm(`/ipfs/${stat.cid}`).catch(() => console.warn(`Tried to unpin unpinned block: ${stat.cid}`));
                }
                await client.files.rm(filename, { recursive: true });
              }
            } catch(err) {
              console.log(err);
              
              // Create dir:
              await client.files.mkdir(dir);
            }

            // Check if pinned already:
            let isPinned = false;
            for await (const pin of client.pin.ls({ cid })) {
              if(pin.cid) {
                isPinned = true;
                break;
              }
            }

            // Copy site files:
            await client.files.cp(src, `${dir}/${block}${isPinned ? '-nopin' : ''}`);
            if(!isPinned) await client.pin.add(src).catch((err) => console.warn(`Failed to pin: ${err}`));

            // Log change:
            mirrored++;
            console.log(`[${++dataIteration}/${dataMap.size}] Mirrored: ${name} => ${src}`);
          }
        } else {
          altContent++;
        }
      } catch(err) {
        console.error(err, name);
        failed++;
      }
    } else {
      noContent++;
    }
  }

  // Update last queried block:
  config.LAST_QUERIED_BLOCK = blockNow;
  fs.writeFileSync('./config.json', JSON.stringify(config, null, ' '));
  console.log(`Mirror Complete!`);
  console.log(`Data updates:           ${events.length}`);
  console.log(`Sites failed:           ${failed}`);
  console.log(`Sites mirrored:         ${mirrored}`);
  console.log(`Sites too large:        ${tooLarge}`);
  console.log(`Sites overridden:       ${overriddenData}`);
  console.log(`Sites without content:  ${noContent}`);
  console.log(`Sites with alt-content: ${altContent}`);
  console.log(`Mirrored up to block: #${blockNow}`);
};
main().catch(console.error);