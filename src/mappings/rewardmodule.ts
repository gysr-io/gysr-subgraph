// ERC20 base reward module event handling and mapping

import { Address, BigInt, log } from '@graphprotocol/graph-ts'
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/templates/RewardModule/ERC20BaseRewardModule'
import {
  RewardsFunded,
  GysrSpent,
  GysrVested,
  RewardsDistributed,
  RewardsExpired,
  RewardsWithdrawn
} from '../../generated/templates/RewardModule/Events'
import { Pool, Token, Platform, Funding, Transaction, User } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, ZERO_ADDRESS, GYSR_TOKEN, PRICING_MIN_TVL, GYSR_FEE, BASE_REWARD_MODULE_TYPES } from '../util/constants'
import { getPrice, createNewToken } from '../pricing/token'
import { updatePool } from '../util/pool'
import { updatePoolDayData, updatePlatform } from '../util/common'
import { handleRewardsFundedCompetitive } from '../modules/erc20competitive'
import { handleRewardsFundedLinear } from '../modules/erc20linear'


export function handleRewardsFunded(event: RewardsFunded): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);

  let pool = Pool.load(contract.owner().toHexString())!;
  let stakingToken = Token.load(pool.stakingToken)!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;

  let amount = integerToDecimal(event.params.amount, rewardToken.decimals)
  pool.rewards = pool.rewards.plus(amount);
  pool.funded = pool.funded.plus(amount);

  // module specific logic
  if (BASE_REWARD_MODULE_TYPES.includes(pool.rewardModuleType)) {
    handleRewardsFundedCompetitive(event, pool, rewardToken);
  } else if (pool.rewardModuleType == 'ERC20Linear') {
    handleRewardsFundedLinear(event, pool, rewardToken);
  }

  // update pool pricing
  updatePool(pool, platform, stakingToken, rewardToken, event.block.timestamp);

  // update platform
  if (pool.tvl.gt(PRICING_MIN_TVL) && !platform._activePools.includes(pool.id)) {
    log.info('Adding pool to active pricing {}', [pool.id.toString()]);
    platform._activePools = platform._activePools.concat([pool.id]);
  }
  updatePlatform(platform, event.block.timestamp, pool);

  // store
  pool.save();
  stakingToken.save();
  rewardToken.save();
  platform.save();

  log.info('rewards funded {} {} {} {}', [pool.id, rewardToken.symbol, amount.toString(), integerToDecimal(event.params.shares, rewardToken.decimals).toString()]);
}


export function handleGysrSpent(event: GysrSpent): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;
  let user = User.load(event.params.user.toHexString())!;

  // update gysr spent on unstake transaction
  let transaction = new Transaction(event.transaction.hash.toHexString());
  let amount = integerToDecimal(event.params.amount, BigInt.fromI32(18));
  transaction.gysrSpent = amount;

  // update total GYSR spent
  platform.gysrSpent = platform.gysrSpent.plus(amount);
  pool.gysrSpent = pool.gysrSpent.plus(amount);
  user.gysrSpent = user.gysrSpent.plus(amount);

  // pricing for volume
  let gysr = Token.load(GYSR_TOKEN.toHexString());
  if (gysr === null) {
    gysr = createNewToken(GYSR_TOKEN);
  }
  gysr.price = getPrice(gysr, event.block.timestamp);
  gysr.updated = event.block.timestamp;

  let dollarAmount = amount.times(gysr.price);
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());
  platform.volume = platform.volume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);

  pool.save();
  transaction.save();
  user.save();
  platform.save();
  poolDayData.save();
  gysr.save();
}


export function handleGysrVested(event: GysrVested): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;

  // update total GYSR vested
  let amount = integerToDecimal(event.params.amount, BigInt.fromI32(18));
  platform.gysrVested = platform.gysrVested.plus(amount);
  platform.gysrFees = platform.gysrFees.plus(amount.times(GYSR_FEE)); // note: we assume a constant fee rate here
  pool.gysrVested = pool.gysrVested.plus(amount);
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());

  platform.save();
  pool.save();
  poolDayData.save();
}


export function handleRewardsDistributed(event: RewardsDistributed): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let token = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;
  let user = User.load(event.params.user.toHexString())!;

  let amount = integerToDecimal(event.params.amount, token.decimals);
  pool.distributed = pool.distributed.plus(amount);

  // usd pricing for volume
  let dollarAmount = amount.times(getPrice(token, event.block.timestamp));
  let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());
  platform.volume = platform.volume.plus(dollarAmount);
  platform.rewardsVolume = platform.rewardsVolume.plus(dollarAmount);
  pool.volume = pool.volume.plus(dollarAmount);
  poolDayData.volume = poolDayData.volume.plus(dollarAmount);
  user.earned = user.earned.plus(dollarAmount);

  // update unstake transaction earnings
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.earnings = amount;

  pool.save();
  transaction.save();
  user.save();
  platform.save();
  poolDayData.save();
}


export function handleRewardsExpired(event: RewardsExpired): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let amount = integerToDecimal(event.params.amount, rewardToken.decimals);

  let fundings = pool.fundings;
  for (let i = 0; i < fundings.length; i++) {
    let funding = Funding.load(fundings[i])!;

    // mark expired funding as cleaned
    if (funding.start.equals(event.params.timestamp)
      && funding.originalAmount.equals(amount)
      && funding.end.lt(event.block.timestamp)
      && !funding.cleaned) {
      funding.cleaned = true;
      funding.save();
      break;
    }
  }
}


export function handleRewardsWithdrawn(event: RewardsWithdrawn): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);
  let pool = Pool.load(contract.owner().toHexString())!;
  let stakingToken = Token.load(pool.stakingToken)!;
  let rewardToken = Token.load(pool.rewardToken)!;
  let platform = Platform.load(ZERO_ADDRESS.toHexString())!;

  // TODO any extra bookkeeping needed here?

  // update pool pricing
  updatePool(pool, platform, stakingToken, rewardToken, event.block.timestamp);

  // update platform
  if (pool.tvl.gt(PRICING_MIN_TVL) && !platform._activePools.includes(pool.id)) {
    log.info('Adding pool to active pricing {}', [pool.id.toString()]);
    platform._activePools = platform._activePools.concat([pool.id]);
  }
  updatePlatform(platform, event.block.timestamp, pool);

  // store
  pool.save();
  stakingToken.save();
  rewardToken.save();
  platform.save();
}