import type pg from 'pg';

import { tx, doLog, SCHEDULED_DATA_ADDRESS, getConnection } from '@paima/utils';
import type { SubmittedChainData } from '@paima/utils';
import type { ChainData, GameStateMachineInitializer } from '@paima/utils';
import Prando from '@paima/prando';

import {
  blockHeightDone,
  deleteScheduled,
  findNonce,
  insertNonce,
  getLatestBlockHeight,
  getScheduledDataByBlockHeight,
  saveLastBlockHeight,
} from './sql/queries.queries.js';
import { randomnessRouter } from './randomness.js';

const SM: GameStateMachineInitializer = {
  initialize: (
    databaseInfo,
    randomnessProtocolEnum,
    gameStateTransitionRouter,
    startBlockHeight
  ) => {
    const DBConn: pg.Pool = getConnection(databaseInfo);
    const readonlyDBConn: pg.Pool = getConnection(databaseInfo, true);

    return {
      latestBlockHeight: async (): Promise<number> => {
        const [b] = await getLatestBlockHeight.run(undefined, readonlyDBConn);
        const blockHeight = b?.block_height ?? startBlockHeight ?? 0;
        return blockHeight;
      },
      getReadonlyDbConn: (): pg.Pool => {
        return readonlyDBConn;
      },
      // Core function which triggers state transitions
      process: async (latestChainData: ChainData): Promise<void> => {
        // Acquire correct STF based on router (based on block height)
        const gameStateTransition = gameStateTransitionRouter(latestChainData.blockNumber);
        // Save blockHeight and randomness seed (which uses the blockHash)
        const getSeed = randomnessRouter(randomnessProtocolEnum);
        const seed = await getSeed(latestChainData, readonlyDBConn);
        await saveLastBlockHeight.run(
          { block_height: latestChainData.blockNumber, seed: seed },
          DBConn
        );
        // Generate Prando object
        const randomnessGenerator = new Prando(seed);

        // Fetch and execute scheduled input data
        const scheduledData = await getScheduledDataByBlockHeight.run(
          { block_height: latestChainData.blockNumber },
          readonlyDBConn
        );
        for (const data of scheduledData) {
          const inputData: SubmittedChainData = {
            userAddress: SCHEDULED_DATA_ADDRESS,
            inputData: data.input_data,
            inputNonce: '',
            suppliedValue: '0',
          };
          // Trigger STF
          const sqlQueries = await gameStateTransition(
            inputData,
            data.block_height,
            randomnessGenerator,
            readonlyDBConn
          );
          try {
            await tx<void>(DBConn, async db => {
              for (const [query, params] of sqlQueries) {
                await query.run(params, db);
              }
              await deleteScheduled.run({ id: data.id }, db);
            });
          } catch (err) {
            doLog(`Database error: ${err}`);
          }
        }

        // Execute user submitted input data
        for (const inputData of latestChainData.submittedData) {
          // Check nonce is valid
          if (inputData.inputNonce === '') {
            doLog(`Skipping inputData with invalid empty nonce: ${inputData}`);
            continue;
          }
          const nonceData = await findNonce.run({ nonce: inputData.inputNonce }, readonlyDBConn);
          if (nonceData.length > 0) {
            doLog(`Skipping inputData with duplicate nonce: ${inputData}`);
            continue;
          }

          // Trigger STF
          const sqlQueries = await gameStateTransition(
            inputData,
            latestChainData.blockNumber,
            randomnessGenerator,
            readonlyDBConn
          );
          try {
            await tx<void>(DBConn, async db => {
              for (const [query, params] of sqlQueries) {
                await query.run(params, db);
              }
              await insertNonce.run(
                {
                  nonce: inputData.inputNonce,
                  block_height: latestChainData.blockNumber,
                },
                db
              );
            });
          } catch (err) {
            doLog(`Database error: ${err}`);
          }
        }
        await blockHeightDone.run({ block_height: latestChainData.blockNumber }, DBConn);
      },
    };
  },
};

export default SM;
