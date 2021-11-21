// pricing for uniswap traded tokens and uniswap LP tokens

import { Address, BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import { UniswapFactory } from '../../generated/templates/GeyserV1/UniswapFactory'
import { UniswapPair } from '../../generated/templates/GeyserV1/UniswapPair'
import { ERC20 } from '../../generated/templates/GeyserV1/ERC20'
import { integerToDecimal } from '../util/common'
import {
  ZERO_BIG_INT,
  ZERO_BIG_DECIMAL,
  WRAPPED_NATIVE_ADDRESS,
  WETH_ADDRESS,
  USD_NATIVE_PAIR,
  USD_WETH_PAIR,
  STABLECOINS,
  UNISWAP_FACTORY,
  SUSHI_FACTORY,
  ZERO_ADDRESS,
  MIN_USD_PRICING,
  STABLECOIN_DECIMALS
} from '../util/constants'



export function isUniswapLiquidityToken(address: Address): boolean {
  let pair = UniswapPair.bind(address);

  let res0 = pair.try_getReserves();
  if (res0.reverted) {
    return false;
  }
  let res1 = pair.try_factory();
  if (res1.reverted) {
    return false;
  }
  return true;
}


export function getUniswapLiquidityTokenAlias(address: Address): string {
  let pair = UniswapPair.bind(address);

  let token0 = ERC20.bind(pair.token0());
  let token1 = ERC20.bind(pair.token1());

  let alias = token0.symbol() + '-' + token1.symbol();
  return alias;
}


export function getNativePrice(): BigDecimal {
  // NOTE: if updating this constant address, we assume that the native token is token0
  let pair = UniswapPair.bind(Address.fromString(USD_NATIVE_PAIR));
  let reserves = pair.getReserves();
  let wnative = integerToDecimal(reserves.value0)  // wrapped native 18 decimals
  let usd = integerToDecimal(reserves.value1, BigInt.fromI32(6))  // usd 6 decimals
  return usd.div(wnative);
}


export function getEthPrice(): BigDecimal {
  // NOTE: if updating this constant address, we assume that weth is token0
  let pair = UniswapPair.bind(Address.fromString(USD_WETH_PAIR));
  let reserves = pair.getReserves();
  let weth = integerToDecimal(reserves.value0)  // weth 18 decimals
  let usd = integerToDecimal(reserves.value1, BigInt.fromI32(6))  // usd 6 decimals
  return usd.div(weth);
}


export function getTokenPrice(address: Address): BigDecimal {
  // early exit for stables
  if (STABLECOINS.includes(address.toHexString())) {
    return BigDecimal.fromString('1.0');
  }
  if (address.toHexString() == WRAPPED_NATIVE_ADDRESS) {
    return getNativePrice();
  }
  if (address.toHexString() == WETH_ADDRESS) {
    return getEthPrice();
  }

  // setup
  let zero = Address.fromString(ZERO_ADDRESS);

  let stables: string[] = [WRAPPED_NATIVE_ADDRESS];
  let decimals: number[] = [18];
  stables = stables.concat(STABLECOINS);
  decimals = decimals.concat(STABLECOIN_DECIMALS);
  if (WETH_ADDRESS != ZERO_ADDRESS) {
    stables = stables.concat([WETH_ADDRESS]);
    decimals = decimals.concat([18]);
  }

  let factories: string[] = [UNISWAP_FACTORY, SUSHI_FACTORY];

  // try each uniswap factory (or clone)
  for (let i = 0; i < factories.length; i++) {
    let factory = UniswapFactory.bind(Address.fromString(factories[i]));

    // try each stable
    for (let j = 0; j < stables.length; j++) {
      let pairAddress = factory.getPair(address, Address.fromString(stables[j]));

      if (pairAddress == zero) {
        continue;
      }

      let pair = UniswapPair.bind(pairAddress);
      let reserves = pair.getReserves();

      let stable: BigDecimal, tokenReserve: BigInt
      let stableDecimals = BigInt.fromI32(decimals[j] as i32);
      if (pair.token0() == address) {
        stable = integerToDecimal(reserves.value1, stableDecimals);
        tokenReserve = reserves.value0;
      } else {
        stable = integerToDecimal(reserves.value0, stableDecimals);
        tokenReserve = reserves.value1;
      }

      // convert native or weth to usd
      if (j == 0) {
        let native = getNativePrice();
        stable = stable.times(native);
      } else if (j == 4) {
        let eth = getEthPrice();
        stable = stable.times(eth);
      }

      // compute price
      if (stable.gt(MIN_USD_PRICING)) {
        let token = ERC20.bind(address);
        let amount = integerToDecimal(tokenReserve, BigInt.fromI32(token.decimals()));

        return stable.div(amount);
      }
    }
  }

  return ZERO_BIG_DECIMAL;
}


export function getUniswapLiquidityTokenPrice(address: Address): BigDecimal {
  let pair = UniswapPair.bind(address);

  let totalSupply = integerToDecimal(pair.totalSupply());
  if (totalSupply == ZERO_BIG_DECIMAL) {
    return ZERO_BIG_DECIMAL;
  }

  let reserves = pair.getReserves();

  // try to price with token 0
  let token0 = ERC20.bind(pair.token0());
  let price0 = getTokenPrice(token0._address);

  if (price0.gt(ZERO_BIG_DECIMAL)) {
    let amount0 = integerToDecimal(reserves.value0, BigInt.fromI32(token0.decimals()));
    let totalReservesUSD = BigDecimal.fromString('2.0').times(price0.times(amount0));

    return totalReservesUSD.div(totalSupply);
  }

  // try to price with token 1
  let token1 = ERC20.bind(pair.token1());
  let price1 = getTokenPrice(token1._address);

  if (price1.gt(ZERO_BIG_DECIMAL)) {
    let amount1 = integerToDecimal(reserves.value1, BigInt.fromI32(token1.decimals()));
    let totalReservesUSD = BigDecimal.fromString('2.0').times(price1.times(amount1));

    return totalReservesUSD.div(totalSupply);
  }

  return ZERO_BIG_DECIMAL;
}
