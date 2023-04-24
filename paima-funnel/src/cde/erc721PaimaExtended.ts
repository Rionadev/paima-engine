import type Web3 from 'web3';

import {
  ChainDataExtensionDatumType,
  DEFAULT_FUNNEL_TIMEOUT,
  mergeSortedArrays,
  timeout,
} from '@paima/utils';
import type {
  CdeErc721MintDatum,
  CdeErc721TransferDatum,
  ChainDataExtensionDatum,
  ChainDataExtensionErc721PaimaExtended,
} from '@paima/runtime';
import type { Minted, Transfer } from '@paima/utils/src/contract-types/ERC721PaimaExtendedContract';

export default async function getCdeData(
  web3: Web3,
  extension: ChainDataExtensionErc721PaimaExtended,
  fromBlock: number,
  toBlock: number
): Promise<ChainDataExtensionDatum[]> {
  // TOOD: typechain is missing the proper type generation for getPastEvents
  // https://github.com/dethcrypto/TypeChain/issues/767
  const [transferEvents, mintedEvents] = await Promise.all([
    fetchTransferEvents(extension, fromBlock, toBlock),
    fetchMintedEvents(extension, fromBlock, toBlock),
  ]);
  const transferData = transferEvents.map((e: Transfer) => transferToTransferDatum(e, extension));
  const mintData = mintedEvents.map((e: Minted) => mintedToMintDatum(e, extension));
  return mergeSortedArrays<ChainDataExtensionDatum>(
    mintData,
    transferData,
    (d1, d2) => d1.blockNumber - d2.blockNumber
  );
}

async function fetchTransferEvents(
  extension: ChainDataExtensionErc721PaimaExtended,
  fromBlock: number,
  toBlock: number
): Promise<Transfer[]> {
  return (await timeout(
    extension.contract.getPastEvents('Transfer', {
      fromBlock: fromBlock,
      toBlock: toBlock,
    }),
    DEFAULT_FUNNEL_TIMEOUT
  )) as unknown as Transfer[];
}

async function fetchMintedEvents(
  extension: ChainDataExtensionErc721PaimaExtended,
  fromBlock: number,
  toBlock: number
): Promise<Minted[]> {
  return (await timeout(
    extension.contract.getPastEvents('Minted', {
      fromBlock: fromBlock,
      toBlock: toBlock,
    }),
    DEFAULT_FUNNEL_TIMEOUT
  )) as unknown as Minted[];
}

function transferToTransferDatum(
  event: Transfer,
  extension: ChainDataExtensionErc721PaimaExtended
): CdeErc721TransferDatum {
  return {
    cdeId: extension.cdeId,
    cdeDatumType: ChainDataExtensionDatumType.ERC721Transfer,
    blockNumber: event.blockNumber,
    payload: {
      from: event.returnValues.from,
      to: event.returnValues.to,
      tokenId: event.returnValues.tokenId,
    },
  };
}

function mintedToMintDatum(
  event: Minted,
  extension: ChainDataExtensionErc721PaimaExtended
): CdeErc721MintDatum {
  return {
    cdeId: extension.cdeId,
    cdeDatumType: ChainDataExtensionDatumType.ERC721Mint,
    blockNumber: event.blockNumber,
    payload: {
      tokenId: event.returnValues.tokenId,
      mintData: event.returnValues.initialData,
    },
    contractAddress: extension.contractAddress,
    initializationPrefix: extension.initializationPrefix,
  };
}
