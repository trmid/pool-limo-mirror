# [pool.limo](https://pool.limo) - Content Mirror

A script to mirror content on IPFS for any website hosted on a [.pool domain](https://names.pooly.me).

## What does it do?

The script queries for the latest .pool domain record updates and pins any IPFS content listed on the 'content' field for each domain. Additionally, any outdated data is unpinned when new content is detected for a domain.

## Why?

This tool was created to increase data availability and redundancy for anyone hosting a site with pool.limo.

## How can I help?

If you have an IPFS node and would like to help improve the data availability of decentralized .pool websites, you can:

1. Clone this repo.
2. Copy `example.config.json` to a new file called `config.json`.
3. Edit `config.json` by providing your IPFS API Endpoint and Optimism RPC URL. (Optionally, specify a max content size for each domain)
4. Setup a cron job to run `node index.js` once every `X` hours at a random minute on the hour. (1 to 3 hour increments are recommended)

**Issues and Pull Requests are also encouraged!**