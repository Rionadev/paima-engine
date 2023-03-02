import { retrieveFee, retryPromise, wait, AddressType } from '@paima/utils';
import { buildEndpointErrorFxn, PaimaMiddlewareErrorCode } from '../errors';
import {
  getCardanoAddress,
  getCardanoHexAddress,
  getEthAddress,
  getPolkadotAddress,
  getPostingMode,
  getStorageAddress,
  getTruffleAddress,
  getWeb3,
  PostingMode,
  setFee,
} from '../state';
import type { BatchedSubunit, BatcherPostResponse, BatcherTrackResponse, Result } from '../types';
import { batchedToJsonString, buildBatchedSubunit } from './data-processing';
import { buildDirectTx } from './transaction-building';
import { batcherQuerySubmitUserInput, batcherQueryTrackUserInput } from './query-constructors';
import { sendWalletTransaction as sendMetamaskWalletTransaction } from '../wallets/metamask';
import { sendWalletTransaction as sendTruffleWalletTransaction } from '../wallets/truffle';
import { postDataToEndpoint } from './general';
import { pushLog } from './logging';

const BATCHER_WAIT_PERIOD = 500;
const BATCHER_RETRIES = 50;

const TX_VERIFICATION_RETRY_DELAY = 1000;
const TX_VERIFICATION_DELAY = 1000;
const TX_VERIFICATION_RETRY_COUNT = 8;

type PostFxn = (tx: Record<string, any>) => Promise<string>;

export async function updateFee() {
  try {
    const web3 = await getWeb3();
    const newFee = await retrieveFee(getStorageAddress(), web3);
    setFee(newFee);
    pushLog(`[updateFee] retrieved fee ${newFee}, ${newFee.length} symbols`);
  } catch (err) {
    pushLog('[updateFee] error while updating fee:', err);
  }
}

// On success returns the block number of the transaction.
export async function postConciselyEncodedData(gameInput: string): Promise<Result<number>> {
  const errorFxn = buildEndpointErrorFxn('postConciselyEncodedData');
  const postingMode = getPostingMode();

  switch (postingMode) {
    case PostingMode.UNBATCHED:
      return postString(sendMetamaskWalletTransaction, getEthAddress(), gameInput);
    case PostingMode.BATCHED_ETH:
      return buildBatchedSubunit(AddressType.EVM, getEthAddress(), getEthAddress(), gameInput).then(
        submitToBatcher
      );
    case PostingMode.BATCHED_CARDANO:
      return buildBatchedSubunit(
        AddressType.CARDANO,
        getCardanoAddress(),
        getCardanoHexAddress(),
        gameInput
      ).then(submitToBatcher);
    case PostingMode.BATCHED_POLKADOT:
      return buildBatchedSubunit(
        AddressType.POLKADOT,
        getPolkadotAddress(),
        getPolkadotAddress(),
        gameInput
      ).then(submitToBatcher);
    case PostingMode.AUTOMATIC:
      return postString(sendTruffleWalletTransaction, getTruffleAddress(), gameInput);
    default:
      return errorFxn(
        PaimaMiddlewareErrorCode.INTERNAL_INVALID_POSTING_MODE,
        `Invalid posting mode: ${postingMode}`
      );
  }
}

async function postString(
  sendWalletTransaction: PostFxn,
  userAddress: string,
  dataUtf8: string
): Promise<Result<number>> {
  const errorFxn = buildEndpointErrorFxn('postString');
  const tx = buildDirectTx(userAddress, 'paimaSubmitGameInput', dataUtf8);

  try {
    const txHash = await sendWalletTransaction(tx);
    return retryPromise(
      () => verifyTx(txHash, TX_VERIFICATION_DELAY),
      TX_VERIFICATION_RETRY_DELAY,
      TX_VERIFICATION_RETRY_COUNT
    );
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_CHAIN, err);
  }
}

// Verifies that the transaction took place and returns its block number on success
async function verifyTx(txHash: string, msTimeout: number): Promise<Result<number>> {
  const [_, web3] = await Promise.all([wait(msTimeout), getWeb3()]);
  const receipt = await web3.eth.getTransactionReceipt(txHash);
  return {
    success: true,
    result: receipt.blockNumber,
  };
}

async function submitToBatcher(subunit: BatchedSubunit): Promise<Result<number>> {
  const errorFxn = buildEndpointErrorFxn('submitToBatcher');

  const body = batchedToJsonString(subunit);
  let res: Response;

  try {
    const query = batcherQuerySubmitUserInput();
    res = await postDataToEndpoint(query, body);
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.ERROR_POSTING_TO_BATCHER);
  }

  let inputHash: string;

  try {
    const response = (await res.json()) as BatcherPostResponse;
    // TODO: proper error checking
    if (!response.success) {
      const msg = `Batcher rejected input "${body}" with response "${response.message}"`;
      return errorFxn(PaimaMiddlewareErrorCode.BATCHER_REJECTED_INPUT, msg);
    }
    inputHash = response.hash;
  } catch (err) {
    return errorFxn(PaimaMiddlewareErrorCode.INVALID_RESPONSE_FROM_BATCHER, err);
  }

  try {
    return verifyBatcherSubmission(inputHash);
  } catch (err) {
    errorFxn(`Rejected input: "${body}"`);
    return errorFxn(PaimaMiddlewareErrorCode.FAILURE_VERIFYING_BATCHER_ACCEPTANCE, err);
  }
}

async function verifyBatcherSubmission(inputHash: string): Promise<Result<number>> {
  const errorFxn = buildEndpointErrorFxn('verifyBatcherSubmission');

  for (let i = 0; i < BATCHER_RETRIES; i++) {
    let res: Response;

    await wait(BATCHER_WAIT_PERIOD);

    try {
      const query = batcherQueryTrackUserInput(inputHash);
      res = await fetch(query);
    } catch (err) {
      errorFxn(PaimaMiddlewareErrorCode.ERROR_QUERYING_BATCHER_ENDPOINT, err);
      continue;
    }

    try {
      const status = (await res.json()) as BatcherTrackResponse;
      // TODO: proper error checking?
      if (status.status === 'rejected') {
        const msg = `Batcher rejected input with response "${status.message}"`;
        return errorFxn(PaimaMiddlewareErrorCode.BATCHER_REJECTED_INPUT, msg);
      } else if (status.status === 'posted') {
        return {
          success: true,
          result: status.block_height,
        };
      }
    } catch (err) {
      errorFxn(PaimaMiddlewareErrorCode.INVALID_RESPONSE_FROM_BATCHER, err);
      continue;
    }
  }

  throw new Error('Batcher submission verification timeout');
}
