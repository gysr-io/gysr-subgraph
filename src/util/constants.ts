// constants

import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts';


export let ZERO_BIG_DECIMAL = BigDecimal.fromString('0');
export let ZERO_BIG_INT = BigInt.fromI32(0);

export let WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

export let ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export let STABLECOINS: string[] = [
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',  // usdc
  '0xdac17f958d2ee523a2206206994597c13d831ec7',  // usdt
  '0x6b175474e89094c44da98b954eedeac495271d0f',  // dai
];
export let STABLECOIN_DECIMALS: number[] = [6, 6, 18];

export let HIGH_VOLUME_TOKENS: string[] = [
  WETH_ADDRESS,                                  // weth
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',  // wbtc
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',  // uni
  '0x514910771af9ca656af840dff83e8264ecf986ca',  // link
  '0xb8c77482e45f1f44de1745f52c74426c631bdd52',  // bnb
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',  // snx
  '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e',  // yfi
  '0xc00e94cb662c3520282e6f5717214004a7f26888',  // comp
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',  // mkr
  '0xc944e90c64b2c07662a292be6244bdf05cda44a7',  // grt
];

// uniswap
export let USDT_WETH_PAIR = '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852';
export let UNISWAP_FACTORY = '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f';
export let MIN_ETH_PRICING = BigDecimal.fromString('1.0');
export let MIN_USD_PRICING = BigDecimal.fromString('1000.0')