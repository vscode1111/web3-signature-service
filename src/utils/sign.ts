import { Wallet } from 'ethers';
import { signEncodedMessage } from '~common-back';

export async function signMessageForPaymentGatewayDeposit(
  signer: Wallet,
  userId: string,
  transactionId: string,
  account: string,
  amount: bigint,
  nonce: number,
  timestampLimit: number,
) {
  return signEncodedMessage(
    signer,
    // userId,  transactionId, account, amount, nonce, timestampLimit
    ['string', 'string', 'address', 'uint256', 'uint32', 'uint32'],
    [userId, transactionId, account, amount, nonce, timestampLimit],
  );
}

export async function signMessageForProRataDeposit(
  signer: Wallet,
  account: string,
  amount: bigint,
  boost: boolean,
  boostExchangeRate: bigint,
  nonce: number,
  transactionId: string,
  timestampLimit: number,
) {
  return signEncodedMessage(
    signer,
    //  account, amount, boost, amountRatio, nonce, transactionId, timestampLimit
    ['address', 'uint256', 'bool', 'uint256', 'uint32', 'string', 'uint32'],
    [account, amount, boost, boostExchangeRate, nonce, transactionId, timestampLimit],
  );
}
