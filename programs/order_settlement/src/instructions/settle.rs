use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_SYSVAR_ID;
use anchor_lang::Discriminator;

use crate::instructions::cpi_util::*;
use crate::errors::OrderSettlementError;
use crate::events::*;
use crate::signature::{build_order_message, order_digest, verify_ed25519_for_order};
use crate::state::*;

// ============================================================
//                    SETTLE ONE — operator-only
// ============================================================

#[derive(Accounts)]
#[instruction(trade: MatchedTrade)]
pub struct SettleOne<'info> {
    #[account(
        mut,
        seeds = [OrderSettlementConfig::SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, OrderSettlementConfig>>,

    #[account(
        seeds = [Operator::SEED_PREFIX, operator.key().as_ref()],
        bump = operator_account.bump,
        constraint = operator_account.operator == operator.key(),
        constraint = operator_account.authorized @ OrderSettlementError::NotOperator,
    )]
    pub operator_account: Box<Account<'info, Operator>>,

    /// CHECK: Authority PDA, signs CPIs.
    #[account(
        mut,
        seeds = [OrderSettlementConfig::AUTHORITY_SEED],
        bump = config.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,

    // ---------- nonce pages (mut, init_if_needed) ----------
    // page_index = nonce / 256, derived from the trade arg.
    #[account(
        init_if_needed,
        payer = operator,
        space = NoncePage::SIZE,
        seeds = [
            NoncePage::SEED_PREFIX,
            trade.maker.trader.as_ref(),
            (trade.maker.nonce / 256).to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub maker_nonce_page: Box<Account<'info, NoncePage>>,

    #[account(
        init_if_needed,
        payer = operator,
        space = NoncePage::SIZE,
        seeds = [
            NoncePage::SEED_PREFIX,
            trade.taker.trader.as_ref(),
            (trade.taker.nonce / 256).to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub taker_nonce_page: Box<Account<'info, NoncePage>>,

    // ---------- perp_engine accounts ----------
    /// CHECK: perp_engine program id.
    #[account(constraint = perp_engine_program.key() == config.perp_engine_program)]
    pub perp_engine_program: UncheckedAccount<'info>,
    /// CHECK: perp_engine::EngineConfig PDA.
    #[account(constraint = engine_config.key() == config.perp_engine_config)]
    pub engine_config: UncheckedAccount<'info>,
    /// CHECK: market PDA.
    #[account(mut)]
    pub engine_market: UncheckedAccount<'info>,
    /// CHECK: maker's position PDA.
    #[account(mut)]
    pub maker_position: UncheckedAccount<'info>,
    /// CHECK: taker's position PDA.
    #[account(mut)]
    pub taker_position: UncheckedAccount<'info>,
    /// CHECK: maker pubkey identity reference.
    pub maker_trader: UncheckedAccount<'info>,
    /// CHECK: taker pubkey identity reference.
    pub taker_trader: UncheckedAccount<'info>,
    /// CHECK: engine Operator PDA for the authority.
    #[account(constraint = engine_operator_account.key() == config.engine_operator_account)]
    pub engine_operator_account: UncheckedAccount<'info>,

    // ----- engine_authority + its vault wiring (forwarded into engine.open_position via remaining_accounts) -----
    /// CHECK: engine_authority PDA — engine signs its internal vault.internal_transfer as this PDA.
    pub engine_authority: UncheckedAccount<'info>,
    /// CHECK: vault Operator PDA for engine_authority (registered at perp_engine setup).
    pub engine_vault_operator: UncheckedAccount<'info>,
    /// CHECK: engine_authority's vault AccountBalance PDA (margin pool destination, mut).
    #[account(mut)]
    pub engine_pool_balance: UncheckedAccount<'info>,

    // ---------- perp_vault accounts ----------
    /// CHECK: perp_vault program id.
    #[account(constraint = perp_vault_program.key() == config.perp_vault_program)]
    pub perp_vault_program: UncheckedAccount<'info>,
    /// CHECK: perp_vault::VaultConfig PDA.
    #[account(constraint = vault_config.key() == config.perp_vault_config)]
    pub vault_config: UncheckedAccount<'info>,
    /// CHECK: vault Operator PDA for the authority.
    #[account(constraint = vault_operator_account.key() == config.vault_operator_account)]
    pub vault_operator_account: UncheckedAccount<'info>,
    /// CHECK: maker's perp_vault AccountBalance PDA.
    #[account(mut)]
    pub maker_balance: UncheckedAccount<'info>,
    /// CHECK: taker's perp_vault AccountBalance PDA.
    #[account(mut)]
    pub taker_balance: UncheckedAccount<'info>,
    /// CHECK: fee_recipient's perp_vault AccountBalance PDA.
    #[account(mut)]
    pub fee_recipient_balance: UncheckedAccount<'info>,

    // ---------- optional commit-reveal snapshots ----------
    /// CHECK: optional maker OrderSnapshot PDA. Caller passes any Pubkey;
    /// the handler ignores it unless owner == this program AND content
    /// matches expected commit hash.
    pub maker_snapshot: UncheckedAccount<'info>,
    /// CHECK: optional taker OrderSnapshot PDA.
    pub taker_snapshot: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar (id checked).
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    #[account(mut)]
    pub operator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub(crate) fn settle_one(mut ctx: Context<SettleOne>, trade: MatchedTrade) -> Result<()> {
    require!(!ctx.accounts.config.paused, OrderSettlementError::PausedError);

    let batch_id = ctx.accounts.config.batch_counter;
    settle_trade_inner(&mut ctx, &trade)?;
    ctx.accounts.config.batch_counter = batch_id
        .checked_add(1)
        .ok_or(OrderSettlementError::MathOverflow)?;

    emit!(BatchSettled {
        batch_id,
        trades_count: 1,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

// ============================================================
//                    SETTLE LOGIC
// ============================================================

fn settle_trade_inner(ctx: &mut Context<SettleOne>, trade: &MatchedTrade) -> Result<()> {
    let cfg = &ctx.accounts.config;
    let now = Clock::get()?.unix_timestamp;

    let maker = &trade.maker;
    let taker = &trade.taker;

    // ---------- structural validations ----------
    require!(maker.trader != taker.trader, OrderSettlementError::SelfTrade);
    require!(maker.market_id == taker.market_id, OrderSettlementError::MarketMismatch);
    require!(maker.is_long != taker.is_long, OrderSettlementError::SidesNotOpposite);
    require!(trade.execution_size > 0, OrderSettlementError::ZeroSize);
    require!(trade.execution_price > 0, OrderSettlementError::ZeroPrice);
    require!(maker.expiry >= now, OrderSettlementError::OrderExpired);
    require!(taker.expiry >= now, OrderSettlementError::OrderExpired);
    require!(maker.signed_at <= now, OrderSettlementError::OrderSignedInFuture);
    require!(taker.signed_at <= now, OrderSettlementError::OrderSignedInFuture);

    if cfg.max_settlement_delay > 0 {
        require!(
            now.saturating_sub(maker.signed_at) <= cfg.max_settlement_delay,
            OrderSettlementError::OrderTooOld
        );
        require!(
            now.saturating_sub(taker.signed_at) <= cfg.max_settlement_delay,
            OrderSettlementError::OrderTooOld
        );
    }

    // execution price/size limits (Solidity C-3/C-4)
    if taker.is_long {
        require!(
            trade.execution_price <= taker.price,
            OrderSettlementError::ExecPriceExceedsTakerLimit
        );
        require!(
            trade.execution_price >= maker.price,
            OrderSettlementError::ExecPriceBelowMakerLimit
        );
    } else {
        require!(
            trade.execution_price >= taker.price,
            OrderSettlementError::ExecPriceBelowTakerLimit
        );
        require!(
            trade.execution_price <= maker.price,
            OrderSettlementError::ExecPriceExceedsMakerLimit
        );
    }
    require!(
        trade.execution_size <= maker.size,
        OrderSettlementError::ExecSizeExceedsMaker
    );
    require!(
        trade.execution_size <= taker.size,
        OrderSettlementError::ExecSizeExceedsTaker
    );

    // ---------- Gate 0c binding (audit N-3 fix) ----------
    // Bind the forwarded identity + vault-balance accounts to the ed25519-signed
    // order traders and the configured fee recipient. Without this, a settlement
    // operator settles a self-signed throwaway order while passing a victim's
    // AccountBalance as maker/taker_balance — debiting the victim's margin.
    require!(
        ctx.accounts.maker_trader.key() == maker.trader,
        OrderSettlementError::AccountMismatch
    );
    require!(
        ctx.accounts.taker_trader.key() == taker.trader,
        OrderSettlementError::AccountMismatch
    );
    {
        let pv = cfg.perp_vault_program;
        let (exp_maker_bal, _) =
            Pubkey::find_program_address(&[b"balance", maker.trader.as_ref()], &pv);
        require!(
            ctx.accounts.maker_balance.key() == exp_maker_bal,
            OrderSettlementError::AccountMismatch
        );
        let (exp_taker_bal, _) =
            Pubkey::find_program_address(&[b"balance", taker.trader.as_ref()], &pv);
        require!(
            ctx.accounts.taker_balance.key() == exp_taker_bal,
            OrderSettlementError::AccountMismatch
        );
        let (exp_fee_bal, _) =
            Pubkey::find_program_address(&[b"balance", cfg.fee_recipient.as_ref()], &pv);
        require!(
            ctx.accounts.fee_recipient_balance.key() == exp_fee_bal,
            OrderSettlementError::AccountMismatch
        );
    }

    // ---------- nonce page binding + replay check ----------
    let maker_page = &mut ctx.accounts.maker_nonce_page;
    let taker_page = &mut ctx.accounts.taker_nonce_page;

    bind_or_check_page(maker_page, maker.trader, maker.nonce, ctx.bumps.maker_nonce_page)?;
    bind_or_check_page(taker_page, taker.trader, taker.nonce, ctx.bumps.taker_nonce_page)?;

    require!(
        !maker_page.is_set(maker.nonce),
        OrderSettlementError::NonceAlreadyUsed
    );
    require!(
        !taker_page.is_set(taker.nonce),
        OrderSettlementError::NonceAlreadyUsed
    );

    // ---------- ed25519 sig verification ----------
    let domain_sep = cfg.domain_separator;
    let maker_msg = build_order_message(maker, &domain_sep);
    let taker_msg = build_order_message(taker, &domain_sep);

    verify_ed25519_for_order(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &maker.trader,
        &maker_msg,
    )?;
    verify_ed25519_for_order(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &taker.trader,
        &taker_msg,
    )?;

    // ---------- mark nonces (CEI: mark before external CPI) ----------
    maker_page.set(maker.nonce);
    taker_page.set(taker.nonce);

    // ---------- commit-reveal snapshot resolution ----------
    let maker_digest = order_digest(maker, &domain_sep);
    let taker_digest = order_digest(taker, &domain_sep);
    let prog_id = ctx.program_id;

    let maker_snap_opt = read_snapshot_if_present(
        &ctx.accounts.maker_snapshot,
        prog_id,
        &maker_digest,
    )?;
    let taker_snap_opt = read_snapshot_if_present(
        &ctx.accounts.taker_snapshot,
        prog_id,
        &taker_digest,
    )?;
    let have_commits = maker_snap_opt.is_some() && taker_snap_opt.is_some();

    if have_commits {
        let m = maker_snap_opt.as_ref().unwrap();
        let t = taker_snap_opt.as_ref().unwrap();
        let later_commit = m.commit_time.max(t.commit_time);
        let delay_used = if m.commit_time > t.commit_time {
            m.min_settlement_delay
        } else {
            t.min_settlement_delay
        };
        require!(
            now >= later_commit.saturating_add(delay_used),
            OrderSettlementError::OrderTooRecent
        );
    } else if cfg.min_settlement_delay > 0 {
        return Err(error!(OrderSettlementError::OrderTooRecent));
    }

    // ---------- fees ----------
    let notional_u128 = (trade.execution_price as u128)
        .checked_mul(trade.execution_size as u128)
        .ok_or(OrderSettlementError::MathOverflow)?
        / SIZE_PRECISION as u128;

    let maker_fee_bps = maker_snap_opt
        .as_ref()
        .map(|s| s.maker_fee_bps)
        .unwrap_or(cfg.maker_fee_bps);
    let taker_fee_bps_base = taker_snap_opt
        .as_ref()
        .map(|s| s.taker_fee_bps)
        .unwrap_or(cfg.taker_fee_bps);

    let extra_bps = if let Some(ts) = taker_snap_opt.as_ref() {
        compute_dynamic_spread_extra(
            &ctx.accounts.engine_market,
            taker.is_long,
            ts.dynamic_spread_enabled,
            ts.spread_tier_1_bps,
            ts.spread_tier_2_bps,
            ts.spread_tier_3_bps,
        )?
    } else {
        compute_dynamic_spread_extra(
            &ctx.accounts.engine_market,
            taker.is_long,
            cfg.dynamic_spread_enabled,
            cfg.spread_tier_1_bps,
            cfg.spread_tier_2_bps,
            cfg.spread_tier_3_bps,
        )?
    };

    let maker_fee_u128 = notional_u128
        .checked_mul(maker_fee_bps as u128)
        .ok_or(OrderSettlementError::MathOverflow)?
        / BPS as u128;
    let effective_taker_bps = (taker_fee_bps_base as u128) + (extra_bps as u128);
    let taker_fee_u128 = notional_u128
        .checked_mul(effective_taker_bps)
        .ok_or(OrderSettlementError::MathOverflow)?
        / BPS as u128;

    let maker_fee: u64 = maker_fee_u128
        .try_into()
        .map_err(|_| OrderSettlementError::MathOverflow)?;
    let taker_fee: u64 = taker_fee_u128
        .try_into()
        .map_err(|_| OrderSettlementError::MathOverflow)?;

    // ---------- CPIs ----------
    let auth_bump = cfg.authority_bump;
    let auth_seeds: &[&[u8]] = &[OrderSettlementConfig::AUTHORITY_SEED, std::slice::from_ref(&auth_bump)];

    if maker_fee > 0 {
        invoke_vault_internal_transfer(
            &ctx.accounts.perp_vault_program,
            &ctx.accounts.vault_config,
            &ctx.accounts.vault_operator_account,
            &ctx.accounts.maker_balance,
            &ctx.accounts.fee_recipient_balance,
            &ctx.accounts.authority,
            maker_fee,
            auth_seeds,
        )?;
    }
    if taker_fee > 0 {
        invoke_vault_internal_transfer(
            &ctx.accounts.perp_vault_program,
            &ctx.accounts.vault_config,
            &ctx.accounts.vault_operator_account,
            &ctx.accounts.taker_balance,
            &ctx.accounts.fee_recipient_balance,
            &ctx.accounts.authority,
            taker_fee,
            auth_seeds,
        )?;
    }

    if extra_bps > 0 {
        emit!(DynamicSpreadApplied {
            market_id: taker.market_id,
            trader: taker.trader,
            extra_fee_bps: extra_bps,
            skew_ratio_bps: 0,
        });
    }

    let exec_size_i64 =
        i64::try_from(trade.execution_size).map_err(|_| OrderSettlementError::MathOverflow)?;
    let maker_delta = if maker.is_long { exec_size_i64 } else { -exec_size_i64 };
    let taker_delta = if taker.is_long { exec_size_i64 } else { -exec_size_i64 };

    // v0.3.1 wiring: forward engine_authority + vault accounts so engine's
    // margin-lock CPI fires from settle_one too. src_balance is per-side.
    invoke_engine_open_position(
        &ctx.accounts.perp_engine_program,
        &ctx.accounts.engine_config,
        &ctx.accounts.engine_market,
        &ctx.accounts.maker_position,
        &ctx.accounts.maker_trader.to_account_info(),
        &ctx.accounts.engine_operator_account,
        &ctx.accounts.authority,
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.engine_authority,
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.vault_config,
        &ctx.accounts.engine_vault_operator,
        &ctx.accounts.maker_balance,         // src_balance (maker margin)
        &ctx.accounts.engine_pool_balance,   // dst pool
        maker_delta,
        trade.execution_price,
        auth_seeds,
    )?;
    invoke_engine_open_position(
        &ctx.accounts.perp_engine_program,
        &ctx.accounts.engine_config,
        &ctx.accounts.engine_market,
        &ctx.accounts.taker_position,
        &ctx.accounts.taker_trader.to_account_info(),
        &ctx.accounts.engine_operator_account,
        &ctx.accounts.authority,
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.engine_authority,
        &ctx.accounts.perp_vault_program,
        &ctx.accounts.vault_config,
        &ctx.accounts.engine_vault_operator,
        &ctx.accounts.taker_balance,         // src_balance (taker margin)
        &ctx.accounts.engine_pool_balance,   // dst pool
        taker_delta,
        trade.execution_price,
        auth_seeds,
    )?;

    emit!(TradeSettled {
        market_id: maker.market_id,
        maker: maker.trader,
        taker: taker.trader,
        price: trade.execution_price,
        size: trade.execution_size,
        taker_is_long: taker.is_long,
        maker_fee,
        taker_fee,
        timestamp: now,
    });
    Ok(())
}

fn bind_or_check_page(
    page: &mut Account<NoncePage>,
    expected_trader: Pubkey,
    nonce: u64,
    expected_bump: u8,
) -> Result<()> {
    let expected_page = nonce / 256;
    if page.trader == Pubkey::default() {
        page.trader = expected_trader;
        page.page_index = expected_page;
        page.bump = expected_bump;
    } else {
        require!(
            page.trader == expected_trader && page.page_index == expected_page,
            OrderSettlementError::NoncePageMismatch
        );
    }
    Ok(())
}

fn read_snapshot_if_present(
    acc: &UncheckedAccount,
    program_id: &Pubkey,
    expected_hash: &[u8; 32],
) -> Result<Option<OrderSnapshot>> {
    if acc.owner != program_id {
        return Ok(None);
    }
    let data = acc.data.borrow();
    if data.len() < OrderSnapshot::SIZE {
        return Ok(None);
    }
    if &data[..8] != <OrderSnapshot as Discriminator>::DISCRIMINATOR {
        return Ok(None);
    }
    // Deserialize body via Borsh directly (skip the disc bytes).
    let mut slice: &[u8] = &data[8..];
    let snap: OrderSnapshot = AnchorDeserialize::deserialize(&mut slice)
        .map_err(|_| error!(OrderSettlementError::CommitHashMismatch))?;
    if snap.commit_hash != *expected_hash {
        return Err(error!(OrderSettlementError::CommitHashMismatch));
    }
    Ok(Some(snap))
}

fn compute_dynamic_spread_extra(
    market_acc: &UncheckedAccount,
    is_long: bool,
    enabled: bool,
    tier1: u32,
    tier2: u32,
    tier3: u32,
) -> Result<u32> {
    if !enabled {
        return Ok(0);
    }
    let data = market_acc.data.borrow();
    // Market layout: 8 disc + 1 bump + 32 market_id + 1 active
    //   + 8*3 (init_margin, maint_margin, max_pos)
    //   + 8 + 8 + 8 (mark, index, last_update)
    //   = 90, then oi_long (u64), oi_short (u64).
    let oi_long_off = 90usize;
    let oi_short_off = oi_long_off + 8;
    if data.len() < oi_short_off + 8 {
        return Ok(0);
    }
    let oi_long = u64::from_le_bytes(
        data[oi_long_off..oi_long_off + 8]
            .try_into()
            .map_err(|_| error!(OrderSettlementError::MathOverflow))?,
    );
    let oi_short = u64::from_le_bytes(
        data[oi_short_off..oi_short_off + 8]
            .try_into()
            .map_err(|_| error!(OrderSettlementError::MathOverflow))?,
    );
    let total = (oi_long as u128).saturating_add(oi_short as u128);
    if total == 0 {
        return Ok(0);
    }

    let increases_skew = if oi_long >= oi_short { is_long } else { !is_long };
    if !increases_skew {
        return Ok(0);
    }

    let dominant = if oi_long > oi_short { oi_long } else { oi_short } as u128;
    let skew_bps = (dominant
        .checked_mul(BPS as u128)
        .ok_or(OrderSettlementError::MathOverflow)?)
        / total;

    if skew_bps >= 7000 {
        Ok(tier3)
    } else if skew_bps >= 5000 {
        Ok(tier2)
    } else if skew_bps >= 3000 {
        Ok(tier1)
    } else {
        Ok(0)
    }
}
