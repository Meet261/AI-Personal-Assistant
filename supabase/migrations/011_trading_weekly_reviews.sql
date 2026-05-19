create table if not exists trading_weekly_reviews (
  id                uuid primary key default gen_random_uuid(),
  week_start        date not null unique,
  week_end          date not null,
  total_trades      int,
  wins              int,
  losses            int,
  win_rate          numeric(5,2),
  total_pnl         numeric(10,2),
  avg_win           numeric(10,2),
  avg_loss          numeric(10,2),
  risk_reward       numeric(6,2),
  best_trade        jsonb,
  worst_trade       jsonb,
  by_symbol         jsonb,
  by_day            jsonb,
  by_reason         jsonb,
  setup_breakdown   jsonb,
  session_breakdown jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists trading_weekly_reviews_week_idx on trading_weekly_reviews(week_start desc);
