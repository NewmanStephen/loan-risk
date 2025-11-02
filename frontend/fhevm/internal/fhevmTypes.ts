export type FhevmRelayerSDKType = {
  __initialized__?: boolean;
  initSDK: (options?: FhevmInitSDKOptions) => Promise<boolean>;
  createInstance: (config: FhevmInstanceConfig) => Promise<FhevmInstance>;
  SepoliaConfig: FhevmInstanceConfig;
};

export interface FhevmWindowType extends Window {
  relayerSDK: FhevmRelayerSDKType;
}

export type FhevmInitSDKOptions = {
  tfhe_threads?: number;
  tfhe_simd?: boolean;
};

export type FhevmLoadSDKType = () => Promise<void>;
export type FhevmInitSDKType = (options?: FhevmInitSDKOptions) => Promise<boolean>;

export type FhevmInstance = import("../fhevmTypes").FhevmInstance;
export type FhevmInstanceConfig = import("../fhevmTypes").FhevmInstanceConfig;


