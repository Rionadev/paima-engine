import type {
  AddressType,
  ContractAddress,
  Hash,
  URI,
  WalletAddress,
  UserSignature,
  InputDataString,
} from '@paima/utils';

export interface BatchedSubunit {
  addressType: AddressType;
  userAddress: WalletAddress;
  userSignature: UserSignature;
  gameInput: InputDataString;
  millisecondTimestamp: string;
}

export interface MiddlewareConnectionDetails {
  storageAddress: ContractAddress;
  backendUri: URI;
  batcherUri: URI;
}

export interface MiddlewareConfig extends MiddlewareConnectionDetails {
  localVersion: string;
}

export interface PostingInfo {
  address: WalletAddress;
  postingModeString: PostingModeString;
}

export type PostingModeString =
  | 'unbatched'
  | 'batched-eth'
  | 'batched-cardano'
  | 'batched-polkadot'
  | 'automatic';

export type PostingModeSwitchResult = PostingModeSwitchSuccessfulResult | FailedResult;

interface PostingModeSwitchSuccessfulResult extends PostingInfo {
  success: true;
}

export type SignFunction = (userAddress: WalletAddress, message: string) => Promise<UserSignature>;

export type CardanoApi = any;

export type PolkadotSignFxn = any;

export type Deployment = 'C1' | 'A1';

export interface SuccessfulResultMessage {
  success: true;
  message: string;
}

export interface SuccessfulResult<T> {
  success: true;
  result: T;
}

export interface FailedResult {
  success: false;
  errorMessage: string;
  errorCode: number;
}

export interface RoundEnd {
  blocks: number;
  seconds: number;
}

export type QueryValue = string | number | boolean;
export type QueryOptions = Record<string, QueryValue>;

export type Result<T> = SuccessfulResult<T> | FailedResult;
export type OldResult = SuccessfulResultMessage | FailedResult;

export type MapName = 'jungle' | 'ocean';

export type UserAnimal = 'piranha' | 'gorilla' | 'anaconda' | 'jaguar' | 'macaw' | 'sloth';

export interface Wallet {
  walletAddress: WalletAddress;
}

interface BatcherPostResponseSuccessful {
  success: true;
  hash: Hash;
}

interface BatcherPostResponseUnsuccessful {
  success: false;
  message: string;
}

export type BatcherPostResponse = BatcherPostResponseSuccessful | BatcherPostResponseUnsuccessful;

interface BatcherTrackResponseCore {
  success: true;
  hash: Hash;
}

interface BatcherTrackResponsePosted extends BatcherTrackResponseCore {
  status: 'posted';
  block_height: number;
  transaction_hash: Hash;
}

interface BatcherTrackResponseRejected extends BatcherTrackResponseCore {
  status: 'rejected';
  message: string;
}

interface BatcherTrackResponseOther extends BatcherTrackResponseCore {
  status: 'accepted' | 'validating';
}

export type BatcherTrackResponse =
  | BatcherTrackResponsePosted
  | BatcherTrackResponseRejected
  | BatcherTrackResponseOther;
