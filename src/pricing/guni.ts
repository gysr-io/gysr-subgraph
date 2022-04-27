// pricing tools for gelato g-uni tokens

import { Address, BigInt, BigDecimal, log, Bytes } from '@graphprotocol/graph-ts'
import { GUniPool } from '../../generated/templates/GeyserV1/GUniPool'
import { ERC20 } from '../../generated/templates/GeyserV1/ERC20'
import { integerToDecimal } from '../util/common'
import { getTokenPrice } from './uniswap'
import { ZERO_BIG_DECIMAL, STABLECOINS, STABLECOIN_DECIMALS } from '../util/constants'



export function isGUniLiquidityToken(address: Address): boolean {
  let pool = GUniPool.bind(address);

  let res0 = pool.try_gelatoRebalanceBPS();
  if (res0.reverted) {
    return false;
  }
  let res1 = pool.try_getUnderlyingBalances();
  if (res1.reverted) {
    return false;
  }
  return true;
}


export function getGUniLiquidityTokenAlias(address: Address): string {
  let pool = GUniPool.bind(address);

  let token0 = ERC20.bind(pool.token0());
  let token1 = ERC20.bind(pool.token1());

  let alias = token0.symbol() + '-' + token1.symbol();
  return alias;
}


export function getGUniLiquidityTokenPrice(address: Address, timestamp: BigInt): BigDecimal {
  let pool = GUniPool.bind(address);

  let reserves = pool.getUnderlyingBalances();

  let token0 = ERC20.bind(pool.token0());
  let token1 = ERC20.bind(pool.token1());

  let decimals0 = BigInt.fromI32(token0.decimals());
  let decimals1 = BigInt.fromI32(token1.decimals());

  let price0 = getTokenPrice(token0._address, decimals0, "", timestamp);
  let price1 = getTokenPrice(token1._address, decimals1, "", timestamp);

  if (price0 == ZERO_BIG_DECIMAL || price1 == ZERO_BIG_DECIMAL) {
    return ZERO_BIG_DECIMAL;
  }

  let amount0 = integerToDecimal(reserves.value0, decimals0);
  let amount1 = integerToDecimal(reserves.value1, decimals1);

  let totalReservesUSD = (price0.times(amount0)).plus(price1.times(amount1));

  let totalSupply = integerToDecimal(pool.totalSupply());
  if (totalSupply == ZERO_BIG_DECIMAL) {
    return ZERO_BIG_DECIMAL;
  }

  return totalReservesUSD.div(totalSupply);
}
