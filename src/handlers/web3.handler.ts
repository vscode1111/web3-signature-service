import dayjs from 'dayjs';
import { Context } from 'moleculer';
import {
  MINUTES,
  checkIfAddress,
  checkIfNumber,
  parseError,
  parseStack,
  toDate,
  toWeiWithFixed,
} from '~common';
import {
  CacheMachine,
  HandlerFunc,
  MissingServicePrivateKey,
  UINT32_MAX,
  checkIfNetwork,
  commonHandlers,
  web3Constants,
} from '~common-service';
import { StatsData } from '~core';
import { services } from '~index';
import {
  GetBlockParams,
  GetBlockResponse,
  GetNetworkParams,
  GetSQRPaymentGatewayDepositSignatureParams,
  GetSQRpProRataDepositSignatureParams,
  GetSQRpProRataDepositSignatureResponse,
  HandlerParams,
} from '~types';
import { signMessageForSQRPaymentGatewayDeposit, signMessageForSQRpProRataDeposit } from '~utils';

// const TIME_OUT = 300;
// const INDEXER_OFFSET = 300;
// const CACHE_TIME_OUT = 60_000;

const TIME_OUT = 5 * MINUTES;
const INDEXER_OFFSET = 5 * MINUTES;
const CACHE_TIME_OUT = Math.round(TIME_OUT / 10);

const CONSTANT_TIME_LIMIT = false;
const BLOCK_KEY = 'BLOCK_KEY';

const cacheMachine = new CacheMachine();

const handlerFunc: HandlerFunc = () => ({
  actions: {
    ...commonHandlers,

    'network.blocks.id': {
      params: {
        network: { type: 'string' },
        id: { type: 'string' },
      } as HandlerParams<GetBlockParams>,
      async handler(ctx: Context<GetBlockParams>): Promise<GetBlockResponse> {
        ctx.broker.logger.info(`web3.handler: network.blocks.id`);

        const network = checkIfNetwork(ctx?.params?.network);
        const paramId = ctx?.params.id;

        let id: string | number = paramId;
        if (paramId !== web3Constants.latest) {
          id = checkIfNumber(ctx?.params.id);
        }

        const block = await services.getProvider(network).getBlockByNumber(id);
        return {
          ...block,
          timestampDate: toDate(block.timestamp),
        };
      },
    },

    'indexer.network.stats': {
      params: {
        network: { type: 'string' },
      } as HandlerParams<GetNetworkParams>,
      async handler(ctx: Context<GetBlockParams>): Promise<StatsData> {
        ctx.broker.logger.info(`web3.handler: indexer.network.stats`);
        const network = checkIfNetwork(ctx.params.network);
        const [engineStats, servicesStats] = await Promise.all([
          services.multiSyncEngine.getStats(network),
          services.getStats(),
        ]);
        return { ...engineStats, ...servicesStats };
      },
    },

    'network.sqr-payment-gateway-contract.deposit-signature': {
      params: {
        network: { type: 'string' },
        contractAddress: { type: 'string' },
        userId: { type: 'string' },
        transactionId: { type: 'string' },
        account: { type: 'string' },
        amount: { type: 'number' },
      } as HandlerParams<GetSQRPaymentGatewayDepositSignatureParams>,
      async handler(
        ctx: Context<GetSQRPaymentGatewayDepositSignatureParams>,
      ): Promise<GetSQRpProRataDepositSignatureResponse> {
        const network = checkIfNetwork(ctx?.params?.network);

        try {
          const network = checkIfNetwork(ctx?.params?.network);
          const contractAddress = checkIfAddress(ctx?.params?.contractAddress);
          const account = checkIfAddress(ctx?.params?.account);
          const { userId, transactionId, amount } = ctx?.params;
          const context = services.getNetworkContext(network);
          if (!context) {
            throw new MissingServicePrivateKey();
          }

          const { owner, getErc20Token, getSqrPaymentGateway } = context;

          let nonce = -1;
          let timestampNow = -1;
          let timestampLimit = -1;
          let dateLimit = new Date(1900, 1, 1);
          let erc20Decimals = 18;

          const sqrPaymentGateway = getSqrPaymentGateway(contractAddress);

          if (CONSTANT_TIME_LIMIT) {
            nonce = Number(await sqrPaymentGateway.getDepositNonce(userId));
            timestampLimit = UINT32_MAX;
          } else {
            const [block, _erc20Decimals, nonceRaw] = await Promise.all([
              cacheMachine.call(
                () => BLOCK_KEY,
                () => services.getProvider(network).getBlockByNumber(web3Constants.latest),
                CACHE_TIME_OUT,
              ),
              cacheMachine.call<number>(
                () => `${contractAddress}-contract-settings`,
                async () => {
                  const tokenAddress = await getSqrPaymentGateway(contractAddress).erc20Token();
                  return Number(await getErc20Token(tokenAddress).decimals());
                },
              ),
              sqrPaymentGateway.getDepositNonce(userId),
            ]);
            erc20Decimals = _erc20Decimals;
            nonce = Number(nonceRaw);
            timestampNow = block.timestamp;
            timestampLimit = timestampNow + TIME_OUT;
            dateLimit = dayjs()
              .add(TIME_OUT + INDEXER_OFFSET, 'seconds')
              .toDate();
          }

          const amountInWei = toWeiWithFixed(amount, erc20Decimals);

          const signature = await signMessageForSQRPaymentGatewayDeposit(
            owner,
            userId,
            transactionId,
            account,
            amountInWei,
            nonce,
            timestampLimit,
          );

          services.changeStats(network, (stats) => ({ signatures: ++stats.signatures }));

          return {
            signature,
            amountInWei: String(amountInWei),
            nonce,
            timestampNow,
            timestampLimit,
            dateLimit,
          };
        } catch (err) {
          services.changeStats(network, (stats) => ({
            errorCount: ++stats.errorCount,
            lastError: parseError(err),
            lastErrorStack: parseStack(err),
            lastErrorDate: new Date(),
          }));

          throw err;
        }
      },
    },

    'network.sqr-payment-gateway-contract.deposit-signature-instant': {
      params: {
        network: { type: 'string' },
        contractAddress: { type: 'string' },
        userId: { type: 'string' },
        transactionId: { type: 'string' },
        account: { type: 'string' },
        amount: { type: 'number' },
      } as HandlerParams<GetSQRPaymentGatewayDepositSignatureParams>,
      async handler(
        ctx: Context<GetSQRPaymentGatewayDepositSignatureParams>,
      ): Promise<GetSQRpProRataDepositSignatureResponse> {
        const network = checkIfNetwork(ctx?.params?.network);

        try {
          const account = checkIfAddress(ctx?.params?.account);
          const { userId, transactionId, amount } = ctx?.params;
          const contractAddress = checkIfAddress(ctx?.params?.contractAddress);
          const context = services.getNetworkContext(network);
          if (!context) {
            throw new MissingServicePrivateKey();
          }

          const { owner, getSqrPaymentGateway, getErc20Token } = context;

          let nonce = 0;
          let timestampNow = -1;
          let timestampLimit = UINT32_MAX;

          const erc20Decimals = await cacheMachine.call<number>(
            () => `${contractAddress}-contract-settings`,
            async () => {
              const tokenAddress = await getSqrPaymentGateway(contractAddress).erc20Token();
              return Number(await getErc20Token(tokenAddress).decimals());
            },
          );

          const amountInWei = toWeiWithFixed(amount, erc20Decimals);

          const signature = await signMessageForSQRPaymentGatewayDeposit(
            owner,
            userId,
            transactionId,
            account,
            amountInWei,
            nonce,
            timestampLimit,
          );

          const dateLimit = dayjs()
            .add(TIME_OUT + INDEXER_OFFSET, 'seconds')
            .toDate();

          services.changeStats(network, (stats) => ({ signatures: ++stats.signatures }));

          return {
            signature,
            amountInWei: String(amountInWei),
            nonce,
            timestampNow,
            timestampLimit,
            dateLimit,
          };
        } catch (err) {
          services.changeStats(network, (stats) => ({
            errorCount: ++stats.errorCount,
            lastError: parseError(err),
            lastErrorStack: parseStack(err),
            lastErrorDate: new Date(),
          }));

          throw err;
        }
      },
    },

    'network.sqr-p-pro-rata-contract.deposit-signature': {
      params: {
        network: { type: 'string' },
        contractAddress: { type: 'string' },
        account: { type: 'string' },
        amount: { type: 'number' },
        boost: { type: 'boolean' },
        transactionId: { type: 'string' },
      } as HandlerParams<GetSQRpProRataDepositSignatureParams>,
      async handler(
        ctx: Context<GetSQRpProRataDepositSignatureParams>,
      ): Promise<GetSQRpProRataDepositSignatureResponse> {
        const network = checkIfNetwork(ctx?.params?.network);

        try {
          const network = checkIfNetwork(ctx?.params?.network);
          const contractAddress = checkIfAddress(ctx?.params?.contractAddress);
          const account = checkIfAddress(ctx?.params?.account);
          const { transactionId, amount, boost } = ctx?.params;
          const context = services.getNetworkContext(network);
          if (!context) {
            throw new MissingServicePrivateKey();
          }

          const { owner, getErc20Token, getSqrpProRata } = context;

          let nonce = -1;
          let timestampNow = -1;
          let timestampLimit = -1;
          let dateLimit = new Date(1900, 1, 1);
          let erc20Decimals = 18;

          const sqrpProRata = getSqrpProRata(contractAddress);

          if (CONSTANT_TIME_LIMIT) {
            nonce = Number(await sqrpProRata.getNonce(account));
            timestampLimit = UINT32_MAX;
          } else {
            const [block, _erc20Decimals, nonceRaw] = await Promise.all([
              cacheMachine.call(
                () => BLOCK_KEY,
                () => services.getProvider(network).getBlockByNumber(web3Constants.latest),
                CACHE_TIME_OUT,
              ),
              cacheMachine.call<number>(
                () => `${contractAddress}-contract-settings`,
                async () => {
                  const tokenAddress = await getSqrpProRata(contractAddress).baseToken();
                  return Number(await getErc20Token(tokenAddress).decimals());
                },
              ),
              sqrpProRata.getNonce(account),
            ]);
            erc20Decimals = _erc20Decimals;
            nonce = Number(nonceRaw);
            timestampNow = block.timestamp;
            timestampLimit = timestampNow + TIME_OUT;
            dateLimit = dayjs()
              .add(TIME_OUT + INDEXER_OFFSET, 'seconds')
              .toDate();
          }

          const amountInWei = toWeiWithFixed(amount, erc20Decimals);

          const signature = await signMessageForSQRpProRataDeposit(
            owner,
            account,
            amountInWei,
            boost,
            nonce,
            transactionId,
            timestampLimit,
          );

          services.changeStats(network, (stats) => ({ signatures: ++stats.signatures }));

          return {
            signature,
            amountInWei: String(amountInWei),
            nonce,
            timestampNow,
            timestampLimit,
            dateLimit,
          };
        } catch (err) {
          services.changeStats(network, (stats) => ({
            errorCount: ++stats.errorCount,
            lastError: parseError(err),
            lastErrorStack: parseStack(err),
            lastErrorDate: new Date(),
          }));

          throw err;
        }
      },
    },
  },
});

module.exports = handlerFunc;
