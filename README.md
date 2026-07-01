# web3-signature-service

EIP-712 signing microservice at **1,500 sig/sec** authorizing on-chain transactions.

## Overview

Signing gateway built for the MagicSquare SQR token ecosystem. Every on-chain action
(claim, vesting release, payment) requires an off-chain EIP-712 authorization before
the user can submit the transaction. This service is the single trusted signer: it
validates the request, records it in a PostgreSQL ledger to prevent replay, and returns
the typed-data signature. Throughput tested at 1,500 signatures/sec to handle burst
load at TGE.

Deployed in the SQR ecosystem that secured **$4M at TGE for 50,000 users** on day one
(Bybit listing, Magic Square).

## Architecture

```
REST client
  -> Moleculer API gateway (HTTP)
  -> Signature service (validates request, checks replay ledger)
      -> PostgreSQL (ledger: nonce, wallet, amount, timestamp)
      -> ethers.js signer (EIP-712 typed-data sign)
  <- signed payload returned to client
  <- user submits on-chain with attached signature
```

Deployed on Kubernetes via Helm. NATS transport between Moleculer services.

## Key decisions

**Moleculer over plain Express:** the signing workload cannot silently drop requests.
Moleculer's NATS transport gives built-in retry, service discovery, and circuit
breaking without manual wiring.

**Write ledger record before signing:** the nonce is written to PostgreSQL before the
signature is issued. If the service crashes mid-request, the nonce is already consumed
and any replay is rejected. Write-then-sign, never sign-then-write.

## Setup & run

```bash
npm install
npm run build
npm run dev        # development
npm run start      # production (compiled JS)
```

Copy `.env.example` to `.env` and configure the PostgreSQL connection, signer private
key, and NATS URL.

## Test coverage

```bash
npm test
```

## License

Proprietary.
