import type { ChainData, ChainDataExtensionDatum, PresyncChainData } from '@paima/sm';
import type { Network } from '@paima/utils';

export function groupCdeData(
  network: Network,
  fromBlock: number,
  toBlock: number,
  data: ChainDataExtensionDatum[][]
): PresyncChainData[] {
  const result: PresyncChainData[] = [];
  for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
    const extensionDatums: ChainDataExtensionDatum[] = [];
    for (const dataStream of data) {
      while (dataStream.length > 0 && dataStream[0].blockNumber === blockNumber) {
        const datum = dataStream.shift();
        if (datum) {
          extensionDatums.push(datum);
        }
      }
    }
    result.push({
      blockNumber,
      extensionDatums,
      network,
    });
  }
  return result;
}

export function composeChainData(
  baseChainData: ChainData[],
  cdeData: PresyncChainData[]
): ChainData[] {
  return baseChainData.map(blockData => ({
    ...blockData,
    extensionDatums: cdeData.find(
      blockCdeData => blockCdeData.blockNumber === blockData.blockNumber
    )?.extensionDatums,
  }));
}
