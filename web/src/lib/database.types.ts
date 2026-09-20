export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  model: {
    Tables: {
      _migrations: {
        Row: {
          applied_at: string | null
          name: string
          sha256: string
        }
        Insert: {
          applied_at?: string | null
          name: string
          sha256: string
        }
        Update: {
          applied_at?: string | null
          name?: string
          sha256?: string
        }
        Relationships: []
      }
      dfs_exposure: {
        Row: {
          leverage: number | null
          own_field_proj: number | null
          own_field_sim: number | null
          own_ours: number | null
          player_id: string
          roi: number | null
          run_id: string
          site: string
          slate_id: string
          win_pct: number | null
        }
        Insert: {
          leverage?: number | null
          own_field_proj?: number | null
          own_field_sim?: number | null
          own_ours?: number | null
          player_id: string
          roi?: number | null
          run_id: string
          site: string
          slate_id: string
          win_pct?: number | null
        }
        Update: {
          leverage?: number | null
          own_field_proj?: number | null
          own_field_sim?: number | null
          own_ours?: number | null
          player_id?: string
          roi?: number | null
          run_id?: string
          site?: string
          slate_id?: string
          win_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dfs_exposure_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      dfs_lineups: {
        Row: {
          construction: string
          created_at: string | null
          id: number
          lineup: Json
          lineup_id: string | null
          proj_fpts: number | null
          run_id: string | null
          salary_used: number | null
          sim_roi: number | null
          sim_win_pct: number | null
          site: string
          slate_id: string
          slate_type: string
          stack: string | null
        }
        Insert: {
          construction?: string
          created_at?: string | null
          id?: number
          lineup: Json
          lineup_id?: string | null
          proj_fpts?: number | null
          run_id?: string | null
          salary_used?: number | null
          sim_roi?: number | null
          sim_win_pct?: number | null
          site: string
          slate_id: string
          slate_type: string
          stack?: string | null
        }
        Update: {
          construction?: string
          created_at?: string | null
          id?: number
          lineup?: Json
          lineup_id?: string | null
          proj_fpts?: number | null
          run_id?: string | null
          salary_used?: number | null
          sim_roi?: number | null
          sim_win_pct?: number | null
          site?: string
          slate_id?: string
          slate_type?: string
          stack?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dfs_lineups_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      edges: {
        Row: {
          created_at: string | null
          edge: number | null
          hold: number | null
          kelly_fraction: number | null
          market_line_id: number
          market_prob: number | null
          market_type: string
          model_prob: number | null
          p_push: number | null
          price: number | null
          ref_id: string
          run_id: string
          side: string
        }
        Insert: {
          created_at?: string | null
          edge?: number | null
          hold?: number | null
          kelly_fraction?: number | null
          market_line_id: number
          market_prob?: number | null
          market_type: string
          model_prob?: number | null
          p_push?: number | null
          price?: number | null
          ref_id: string
          run_id: string
          side: string
        }
        Update: {
          created_at?: string | null
          edge?: number | null
          hold?: number | null
          kelly_fraction?: number | null
          market_line_id?: number
          market_prob?: number | null
          market_type?: string
          model_prob?: number | null
          p_push?: number | null
          price?: number | null
          ref_id?: string
          run_id?: string
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "edges_market_line_id_fkey"
            columns: ["market_line_id"]
            isOneToOne: false
            referencedRelation: "market_lines_latest"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      external_grades: {
        Row: {
          actual: number | null
          error: number | null
          graded_at: string | null
          kind: string
          metric: string
          n: number | null
          predicted: number | null
          ref_id: string
          season: number
          source: string
          week: number
        }
        Insert: {
          actual?: number | null
          error?: number | null
          graded_at?: string | null
          kind: string
          metric: string
          n?: number | null
          predicted?: number | null
          ref_id: string
          season: number
          source: string
          week: number
        }
        Update: {
          actual?: number | null
          error?: number | null
          graded_at?: string | null
          kind?: string
          metric?: string
          n?: number | null
          predicted?: number | null
          ref_id?: string
          season?: number
          source?: string
          week?: number
        }
        Relationships: []
      }
      fair_props: {
        Row: {
          actual: number | null
          created_at: string | null
          fair_line: number
          graded_at: string | null
          mean: number | null
          over_hit: number | null
          p_over: number
          p10: number | null
          p25: number | null
          p75: number | null
          p90: number | null
          player_id: string
          run_id: string
          sentence: string | null
          stat: string
        }
        Insert: {
          actual?: number | null
          created_at?: string | null
          fair_line: number
          graded_at?: string | null
          mean?: number | null
          over_hit?: number | null
          p_over: number
          p10?: number | null
          p25?: number | null
          p75?: number | null
          p90?: number | null
          player_id: string
          run_id: string
          sentence?: string | null
          stat: string
        }
        Update: {
          actual?: number | null
          created_at?: string | null
          fair_line?: number
          graded_at?: string | null
          mean?: number | null
          over_hit?: number | null
          p_over?: number
          p10?: number | null
          p25?: number | null
          p75?: number | null
          p90?: number | null
          player_id?: string
          run_id?: string
          sentence?: string | null
          stat?: string
        }
        Relationships: [
          {
            foreignKeyName: "fair_props_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      line_reference: {
        Row: {
          bookmaker: string
          effective_from: string
          fallback_source: string
          source: string
        }
        Insert: {
          bookmaker: string
          effective_from: string
          fallback_source: string
          source: string
        }
        Update: {
          bookmaker?: string
          effective_from?: string
          fallback_source?: string
          source?: string
        }
        Relationships: []
      }
      llm_calls: {
        Row: {
          created_at: string
          id: number
          input: Json
          model: string
          output: Json | null
          phase: string
          ref_id: string | null
          run_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          input: Json
          model: string
          output?: Json | null
          phase: string
          ref_id?: string | null
          run_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          input?: Json
          model?: string
          output?: Json | null
          phase?: string
          ref_id?: string | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      market_props: {
        Row: {
          captured_at: string | null
          id: number
          line: number
          one_sided: boolean
          over_odds: number | null
          player_id: string | null
          player_name: string
          price: number | null
          season: number
          side: string | null
          source: string | null
          sportsbook: string | null
          stat: string
          under_odds: number | null
          week: number
        }
        Insert: {
          captured_at?: string | null
          id?: number
          line: number
          one_sided?: boolean
          over_odds?: number | null
          player_id?: string | null
          player_name: string
          price?: number | null
          season: number
          side?: string | null
          source?: string | null
          sportsbook?: string | null
          stat: string
          under_odds?: number | null
          week: number
        }
        Update: {
          captured_at?: string | null
          id?: number
          line?: number
          one_sided?: boolean
          over_odds?: number | null
          player_id?: string | null
          player_name?: string
          price?: number | null
          season?: number
          side?: string | null
          source?: string | null
          sportsbook?: string | null
          stat?: string
          under_odds?: number | null
          week?: number
        }
        Relationships: []
      }
      player_correlations: {
        Row: {
          corr_dk: number | null
          player_id_a: string
          player_id_b: string
          run_id: string
        }
        Insert: {
          corr_dk?: number | null
          player_id_a: string
          player_id_b: string
          run_id: string
        }
        Update: {
          corr_dk?: number | null
          player_id_a?: string
          player_id_b?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_correlations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      player_fpts_actual: {
        Row: {
          fpts_dk: number
          fpts_fd: number
          fpts_ppr: number
          had_opportunity: boolean
          opponent: string | null
          player_id: string
          position: string | null
          season: number
          season_type: string
          team: string | null
          week: number
        }
        Insert: {
          fpts_dk: number
          fpts_fd: number
          fpts_ppr: number
          had_opportunity: boolean
          opponent?: string | null
          player_id: string
          position?: string | null
          season: number
          season_type: string
          team?: string | null
          week: number
        }
        Update: {
          fpts_dk?: number
          fpts_fd?: number
          fpts_ppr?: number
          had_opportunity?: boolean
          opponent?: string | null
          player_id?: string
          position?: string | null
          season?: number
          season_type?: string
          team?: string | null
          week?: number
        }
        Relationships: []
      }
      proj_games: {
        Row: {
          draws_path: string | null
          fair_spread: number | null
          fair_total: number | null
          game_id: string
          home_win_prob: number | null
          line_grid: Json | null
          market_spread: number | null
          market_total: number | null
          mean_spread: number | null
          mean_total: number | null
          p_home_cover_market: number | null
          p_over_market: number | null
          run_id: string
        }
        Insert: {
          draws_path?: string | null
          fair_spread?: number | null
          fair_total?: number | null
          game_id: string
          home_win_prob?: number | null
          line_grid?: Json | null
          market_spread?: number | null
          market_total?: number | null
          mean_spread?: number | null
          mean_total?: number | null
          p_home_cover_market?: number | null
          p_over_market?: number | null
          run_id: string
        }
        Update: {
          draws_path?: string | null
          fair_spread?: number | null
          fair_total?: number | null
          game_id?: string
          home_win_prob?: number | null
          line_grid?: Json | null
          market_spread?: number | null
          market_total?: number | null
          mean_spread?: number | null
          mean_total?: number | null
          p_home_cover_market?: number | null
          p_over_market?: number | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proj_games_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      proj_players: {
        Row: {
          draws_path: string | null
          fpts_dk_mean: number | null
          fpts_dk_sd: number | null
          fpts_fd_mean: number | null
          fpts_fd_sd: number | null
          game_id: string | null
          player_id: string
          position: string | null
          proj_own_pct: number | null
          run_id: string
          stat_summary: Json
          team: string | null
        }
        Insert: {
          draws_path?: string | null
          fpts_dk_mean?: number | null
          fpts_dk_sd?: number | null
          fpts_fd_mean?: number | null
          fpts_fd_sd?: number | null
          game_id?: string | null
          player_id: string
          position?: string | null
          proj_own_pct?: number | null
          run_id: string
          stat_summary: Json
          team?: string | null
        }
        Update: {
          draws_path?: string | null
          fpts_dk_mean?: number | null
          fpts_dk_sd?: number | null
          fpts_fd_mean?: number | null
          fpts_fd_sd?: number | null
          game_id?: string | null
          player_id?: string
          position?: string | null
          proj_own_pct?: number | null
          run_id?: string
          stat_summary?: Json
          team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proj_players_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      prop_edges: {
        Row: {
          actual: number | null
          created_at: string | null
          edge: number | null
          edge_floor: number | null
          game_id: string | null
          graded_at: string | null
          hold: number | null
          kelly_fraction: number | null
          lean: string | null
          line: number
          market_prob: number | null
          market_prop_id: number
          model_prob: number | null
          one_sided: boolean
          outcome: number | null
          p_over: number | null
          p_push: number | null
          player_id: string
          pnl: number | null
          price: number | null
          run_id: string
          sentence: string | null
          side: string
          stat: string
        }
        Insert: {
          actual?: number | null
          created_at?: string | null
          edge?: number | null
          edge_floor?: number | null
          game_id?: string | null
          graded_at?: string | null
          hold?: number | null
          kelly_fraction?: number | null
          lean?: string | null
          line: number
          market_prob?: number | null
          market_prop_id: number
          model_prob?: number | null
          one_sided?: boolean
          outcome?: number | null
          p_over?: number | null
          p_push?: number | null
          player_id: string
          pnl?: number | null
          price?: number | null
          run_id: string
          sentence?: string | null
          side: string
          stat: string
        }
        Update: {
          actual?: number | null
          created_at?: string | null
          edge?: number | null
          edge_floor?: number | null
          game_id?: string | null
          graded_at?: string | null
          hold?: number | null
          kelly_fraction?: number | null
          lean?: string | null
          line?: number
          market_prob?: number | null
          market_prop_id?: number
          model_prob?: number | null
          one_sided?: boolean
          outcome?: number | null
          p_over?: number | null
          p_push?: number | null
          player_id?: string
          pnl?: number | null
          price?: number | null
          run_id?: string
          sentence?: string | null
          side?: string
          stat?: string
        }
        Relationships: [
          {
            foreignKeyName: "prop_edges_market_prop_id_fkey"
            columns: ["market_prop_id"]
            isOneToOne: false
            referencedRelation: "market_props"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prop_edges_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      results: {
        Row: {
          actual: number | null
          close_line: number | null
          close_market_line_id: number | null
          close_price: number | null
          close_source: string | null
          closing_prob: number | null
          clv: number | null
          clv_points: number | null
          edge: number | null
          graded_at: string | null
          is_last_snapshot: boolean | null
          kelly_fraction: number | null
          line: number | null
          market_line_id: number
          market_prob: number | null
          market_type: string
          model_prob: number | null
          outcome: number | null
          pnl: number | null
          pnl_kelly: number | null
          predated_kickoff: boolean
          price: number | null
          ref_id: string
          run_id: string
          side: string
          verdict_call: string | null
          verdict_pick: boolean | null
        }
        Insert: {
          actual?: number | null
          close_line?: number | null
          close_market_line_id?: number | null
          close_price?: number | null
          close_source?: string | null
          closing_prob?: number | null
          clv?: number | null
          clv_points?: number | null
          edge?: number | null
          graded_at?: string | null
          is_last_snapshot?: boolean | null
          kelly_fraction?: number | null
          line?: number | null
          market_line_id: number
          market_prob?: number | null
          market_type: string
          model_prob?: number | null
          outcome?: number | null
          pnl?: number | null
          pnl_kelly?: number | null
          predated_kickoff?: boolean
          price?: number | null
          ref_id: string
          run_id: string
          side: string
          verdict_call?: string | null
          verdict_pick?: boolean | null
        }
        Update: {
          actual?: number | null
          close_line?: number | null
          close_market_line_id?: number | null
          close_price?: number | null
          close_source?: string | null
          closing_prob?: number | null
          clv?: number | null
          clv_points?: number | null
          edge?: number | null
          graded_at?: string | null
          is_last_snapshot?: boolean | null
          kelly_fraction?: number | null
          line?: number | null
          market_line_id?: number
          market_prob?: number | null
          market_type?: string
          model_prob?: number | null
          outcome?: number | null
          pnl?: number | null
          pnl_kelly?: number | null
          predated_kickoff?: boolean
          price?: number | null
          ref_id?: string
          run_id?: string
          side?: string
          verdict_call?: string | null
          verdict_pick?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "results_close_market_line_id_fkey"
            columns: ["close_market_line_id"]
            isOneToOne: false
            referencedRelation: "market_lines_latest"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_market_line_id_fkey"
            columns: ["market_line_id"]
            isOneToOne: false
            referencedRelation: "market_lines_latest"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      run_team_inputs: {
        Row: {
          def_ppd_allowed: number | null
          drives_mean: number | null
          league_def_ppd_allowed: number | null
          league_off_ppd: number | null
          neutral_pass_rate: number | null
          off_ppd_adj: number | null
          off_ppd_raw: number | null
          plays_per_drive: number | null
          qb_lookback_att: number | null
          qb_lookback_id: string | null
          qb_pass_factor: number | null
          qb_starter_att: number | null
          qb_starter_id: string | null
          run_id: string
          team: string
        }
        Insert: {
          def_ppd_allowed?: number | null
          drives_mean?: number | null
          league_def_ppd_allowed?: number | null
          league_off_ppd?: number | null
          neutral_pass_rate?: number | null
          off_ppd_adj?: number | null
          off_ppd_raw?: number | null
          plays_per_drive?: number | null
          qb_lookback_att?: number | null
          qb_lookback_id?: string | null
          qb_pass_factor?: number | null
          qb_starter_att?: number | null
          qb_starter_id?: string | null
          run_id: string
          team: string
        }
        Update: {
          def_ppd_allowed?: number | null
          drives_mean?: number | null
          league_def_ppd_allowed?: number | null
          league_off_ppd?: number | null
          neutral_pass_rate?: number | null
          off_ppd_adj?: number | null
          off_ppd_raw?: number | null
          plays_per_drive?: number | null
          qb_lookback_att?: number | null
          qb_lookback_id?: string | null
          qb_pass_factor?: number | null
          qb_starter_att?: number | null
          qb_starter_id?: string | null
          run_id?: string
          team?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_team_inputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      sim_checks: {
        Row: {
          check_name: string
          created_at: string | null
          detail: string | null
          game_id: string | null
          id: number
          passed: boolean
          run_id: string | null
          severity: string
          team: string | null
          threshold: number | null
          value: number | null
        }
        Insert: {
          check_name: string
          created_at?: string | null
          detail?: string | null
          game_id?: string | null
          id?: number
          passed: boolean
          run_id?: string | null
          severity: string
          team?: string | null
          threshold?: number | null
          value?: number | null
        }
        Update: {
          check_name?: string
          created_at?: string | null
          detail?: string | null
          game_id?: string | null
          id?: number
          passed?: boolean
          run_id?: string | null
          severity?: string
          team?: string | null
          threshold?: number | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sim_checks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      sim_runs: {
        Row: {
          config_hash: string | null
          created_at: string | null
          draws_per_game: number | null
          git_sha: string | null
          note: string | null
          run_id: string
          season: number
          week: number
        }
        Insert: {
          config_hash?: string | null
          created_at?: string | null
          draws_per_game?: number | null
          git_sha?: string | null
          note?: string | null
          run_id?: string
          season: number
          week: number
        }
        Update: {
          config_hash?: string | null
          created_at?: string | null
          draws_per_game?: number | null
          git_sha?: string | null
          note?: string | null
          run_id?: string
          season?: number
          week?: number
        }
        Relationships: []
      }
      usage_claims: {
        Row: {
          channel: string
          confidence: string
          created_at: string
          id: number
          llm_call_id: number | null
          player_id: string
          player_name: string
          quote: string | null
          raw_text: string
          season: number
          source_url: string | null
          status: string
          team: string
          usage_multiplier: number
          week: number
        }
        Insert: {
          channel: string
          confidence: string
          created_at?: string
          id?: number
          llm_call_id?: number | null
          player_id: string
          player_name: string
          quote?: string | null
          raw_text: string
          season: number
          source_url?: string | null
          status: string
          team: string
          usage_multiplier: number
          week: number
        }
        Update: {
          channel?: string
          confidence?: string
          created_at?: string
          id?: number
          llm_call_id?: number | null
          player_id?: string
          player_name?: string
          quote?: string | null
          raw_text?: string
          season?: number
          source_url?: string | null
          status?: string
          team?: string
          usage_multiplier?: number
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_claims_llm_call_id_fkey"
            columns: ["llm_call_id"]
            isOneToOne: false
            referencedRelation: "llm_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      verdicts: {
        Row: {
          backfilled: boolean
          created_at: string | null
          game_id: string
          market_line_id: number
          payload: Json
          run_id: string
        }
        Insert: {
          backfilled?: boolean
          created_at?: string | null
          game_id: string
          market_line_id: number
          payload: Json
          run_id: string
        }
        Update: {
          backfilled?: boolean
          created_at?: string | null
          game_id?: string
          market_line_id?: number
          payload?: Json
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verdicts_market_line_id_fkey"
            columns: ["market_line_id"]
            isOneToOne: false
            referencedRelation: "market_lines_latest"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verdicts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
    }
    Views: {
      edges_latest: {
        Row: {
          created_at: string | null
          edge: number | null
          hold: number | null
          kelly_fraction: number | null
          market_line_id: number | null
          market_prob: number | null
          market_type: string | null
          model_prob: number | null
          p_push: number | null
          price: number | null
          ref_id: string | null
          run_id: string | null
          side: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edges_market_line_id_fkey"
            columns: ["market_line_id"]
            isOneToOne: false
            referencedRelation: "market_lines_latest"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      market_lines_latest: {
        Row: {
          away_moneyline: number | null
          away_spread_odds: number | null
          bookmaker: string | null
          captured_at: string | null
          fetched_at: string | null
          game_id: string | null
          home_moneyline: number | null
          home_spread_odds: number | null
          id: number | null
          over_odds: number | null
          source: string | null
          spread_line: number | null
          total_line: number | null
          under_odds: number | null
        }
        Relationships: []
      }
      verdicts_latest: {
        Row: {
          backfilled: boolean | null
          created_at: string | null
          game_id: string | null
          market_line_id: number | null
          payload: Json | null
          run_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verdicts_market_line_id_fkey"
            columns: ["market_line_id"]
            isOneToOne: false
            referencedRelation: "market_lines_latest"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verdicts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sim_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  raw: {
    Tables: {
      depth_charts: {
        Row: {
          club_code: string
          depth_position: string | null
          depth_team: number | null
          dt: string | null
          full_name: string | null
          gsis_id: string | null
          ingested_at: string | null
          position: string | null
          season: number
          week: number | null
        }
        Insert: {
          club_code: string
          depth_position?: string | null
          depth_team?: number | null
          dt?: string | null
          full_name?: string | null
          gsis_id?: string | null
          ingested_at?: string | null
          position?: string | null
          season: number
          week?: number | null
        }
        Update: {
          club_code?: string
          depth_position?: string | null
          depth_team?: number | null
          dt?: string | null
          full_name?: string | null
          gsis_id?: string | null
          ingested_at?: string | null
          position?: string | null
          season?: number
          week?: number | null
        }
        Relationships: []
      }
      dk_player_crosswalk: {
        Row: {
          automatic: boolean
          gsis_id: string
          player_dk_id: string
          source: string
          updated_at: string
        }
        Insert: {
          automatic?: boolean
          gsis_id: string
          player_dk_id: string
          source: string
          updated_at?: string
        }
        Update: {
          automatic?: boolean
          gsis_id?: string
          player_dk_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      dk_salaries: {
        Row: {
          avg_points: number | null
          game_info: string | null
          ingested_at: string | null
          name: string
          player_dk_id: string
          player_id: string | null
          position: string | null
          roster_position: string
          salary: number | null
          site: string
          slate_id: string
          slate_type: string
          team: string | null
        }
        Insert: {
          avg_points?: number | null
          game_info?: string | null
          ingested_at?: string | null
          name: string
          player_dk_id: string
          player_id?: string | null
          position?: string | null
          roster_position: string
          salary?: number | null
          site: string
          slate_id: string
          slate_type: string
          team?: string | null
        }
        Update: {
          avg_points?: number | null
          game_info?: string | null
          ingested_at?: string | null
          name?: string
          player_dk_id?: string
          player_id?: string | null
          position?: string | null
          roster_position?: string
          salary?: number | null
          site?: string
          slate_id?: string
          slate_type?: string
          team?: string | null
        }
        Relationships: []
      }
      external_games: {
        Row: {
          actual_away_pts: number | null
          actual_home_pts: number | null
          actual_margin_home: number | null
          actual_total: number | null
          actual_winner: string | null
          ats_result: string | null
          away_team: string | null
          edge_ml_home: number | null
          edge_spread_home: number | null
          edge_total: number | null
          game_id: string
          gameday: string | null
          gametime: string | null
          home_team: string | null
          ingested_at: string | null
          margin_within_7: string | null
          market_ml_away: number | null
          market_ml_home: number | null
          market_p_home_novig: number | null
          market_spread_home: number | null
          market_total: number | null
          pick_winner_result: string | null
          season: number
          sim_ats_lean: string | null
          sim_away_pts: number | null
          sim_home_pts: number | null
          sim_margin_home: number | null
          sim_p_home_win: number | null
          sim_pick_winner: string | null
          sim_total: number | null
          sim_total_lean: string | null
          source: string
          status: string | null
          week: number
        }
        Insert: {
          actual_away_pts?: number | null
          actual_home_pts?: number | null
          actual_margin_home?: number | null
          actual_total?: number | null
          actual_winner?: string | null
          ats_result?: string | null
          away_team?: string | null
          edge_ml_home?: number | null
          edge_spread_home?: number | null
          edge_total?: number | null
          game_id: string
          gameday?: string | null
          gametime?: string | null
          home_team?: string | null
          ingested_at?: string | null
          margin_within_7?: string | null
          market_ml_away?: number | null
          market_ml_home?: number | null
          market_p_home_novig?: number | null
          market_spread_home?: number | null
          market_total?: number | null
          pick_winner_result?: string | null
          season: number
          sim_ats_lean?: string | null
          sim_away_pts?: number | null
          sim_home_pts?: number | null
          sim_margin_home?: number | null
          sim_p_home_win?: number | null
          sim_pick_winner?: string | null
          sim_total?: number | null
          sim_total_lean?: string | null
          source: string
          status?: string | null
          week: number
        }
        Update: {
          actual_away_pts?: number | null
          actual_home_pts?: number | null
          actual_margin_home?: number | null
          actual_total?: number | null
          actual_winner?: string | null
          ats_result?: string | null
          away_team?: string | null
          edge_ml_home?: number | null
          edge_spread_home?: number | null
          edge_total?: number | null
          game_id?: string
          gameday?: string | null
          gametime?: string | null
          home_team?: string | null
          ingested_at?: string | null
          margin_within_7?: string | null
          market_ml_away?: number | null
          market_ml_home?: number | null
          market_p_home_novig?: number | null
          market_spread_home?: number | null
          market_total?: number | null
          pick_winner_result?: string | null
          season?: number
          sim_ats_lean?: string | null
          sim_away_pts?: number | null
          sim_home_pts?: number | null
          sim_margin_home?: number | null
          sim_p_home_win?: number | null
          sim_pick_winner?: string | null
          sim_total?: number | null
          sim_total_lean?: string | null
          source?: string
          status?: string | null
          week?: number
        }
        Relationships: []
      }
      external_ids: {
        Row: {
          external_id: string
          player_id: string | null
          player_name: string | null
          position: string | null
          source: string
          team: string | null
          updated_at: string | null
        }
        Insert: {
          external_id: string
          player_id?: string | null
          player_name?: string | null
          position?: string | null
          source: string
          team?: string | null
          updated_at?: string | null
        }
        Update: {
          external_id?: string
          player_id?: string | null
          player_name?: string | null
          position?: string | null
          source?: string
          team?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      external_players: {
        Row: {
          fpts_dk: number | null
          game_id: string | null
          ingested_at: string | null
          name: string
          opponent: string | null
          pass_int: number | null
          pass_td: number | null
          pass_yds: number | null
          player_id: string | null
          rec_td: number | null
          rec_yds: number | null
          rush_td: number | null
          rush_yds: number | null
          season: number
          source: string
          team: string
          week: number
        }
        Insert: {
          fpts_dk?: number | null
          game_id?: string | null
          ingested_at?: string | null
          name: string
          opponent?: string | null
          pass_int?: number | null
          pass_td?: number | null
          pass_yds?: number | null
          player_id?: string | null
          rec_td?: number | null
          rec_yds?: number | null
          rush_td?: number | null
          rush_yds?: number | null
          season: number
          source: string
          team: string
          week: number
        }
        Update: {
          fpts_dk?: number | null
          game_id?: string | null
          ingested_at?: string | null
          name?: string
          opponent?: string | null
          pass_int?: number | null
          pass_td?: number | null
          pass_yds?: number | null
          player_id?: string | null
          rec_td?: number | null
          rec_yds?: number | null
          rush_td?: number | null
          rush_yds?: number | null
          season?: number
          source?: string
          team?: string
          week?: number
        }
        Relationships: []
      }
      external_projections: {
        Row: {
          ingested_at: string | null
          mean: number | null
          median: number | null
          player_id: string | null
          player_name: string | null
          position: string | null
          rts_id: string
          season: number
          source: string
          stat: string
          stat_raw: string | null
          team: string | null
          week: number
        }
        Insert: {
          ingested_at?: string | null
          mean?: number | null
          median?: number | null
          player_id?: string | null
          player_name?: string | null
          position?: string | null
          rts_id: string
          season: number
          source: string
          stat: string
          stat_raw?: string | null
          team?: string | null
          week: number
        }
        Update: {
          ingested_at?: string | null
          mean?: number | null
          median?: number | null
          player_id?: string | null
          player_name?: string | null
          position?: string | null
          rts_id?: string
          season?: number
          source?: string
          stat?: string
          stat_raw?: string | null
          team?: string | null
          week?: number
        }
        Relationships: []
      }
      external_shares: {
        Row: {
          ingested_at: string | null
          own: number | null
          pass_att_share: number | null
          player_id: string | null
          player_name: string | null
          position: string | null
          rec_td_share: number | null
          rts_id: string
          rush_att_share: number | null
          rush_td_share: number | null
          season: number
          source: string
          target_share: number | null
          team: string | null
          week: number
        }
        Insert: {
          ingested_at?: string | null
          own?: number | null
          pass_att_share?: number | null
          player_id?: string | null
          player_name?: string | null
          position?: string | null
          rec_td_share?: number | null
          rts_id: string
          rush_att_share?: number | null
          rush_td_share?: number | null
          season: number
          source: string
          target_share?: number | null
          team?: string | null
          week: number
        }
        Update: {
          ingested_at?: string | null
          own?: number | null
          pass_att_share?: number | null
          player_id?: string | null
          player_name?: string | null
          position?: string | null
          rec_td_share?: number | null
          rts_id?: string
          rush_att_share?: number | null
          rush_td_share?: number | null
          season?: number
          source?: string
          target_share?: number | null
          team?: string | null
          week?: number
        }
        Relationships: []
      }
      external_teams: {
        Row: {
          ingested_at: string | null
          pace: number | null
          points: number | null
          rush_rate: number | null
          rush_td_ratio: number | null
          sack_rate: number | null
          season: number
          source: string
          team: string
          week: number
        }
        Insert: {
          ingested_at?: string | null
          pace?: number | null
          points?: number | null
          rush_rate?: number | null
          rush_td_ratio?: number | null
          sack_rate?: number | null
          season: number
          source: string
          team: string
          week: number
        }
        Update: {
          ingested_at?: string | null
          pace?: number | null
          points?: number | null
          rush_rate?: number | null
          rush_td_ratio?: number | null
          sack_rate?: number | null
          season?: number
          source?: string
          team?: string
          week?: number
        }
        Relationships: []
      }
      ff_opportunity_weekly: {
        Row: {
          full_name: string | null
          ingested_at: string | null
          player_id: string
          position: string | null
          posteam: string | null
          season: number
          stats: Json
          week: number
        }
        Insert: {
          full_name?: string | null
          ingested_at?: string | null
          player_id: string
          position?: string | null
          posteam?: string | null
          season: number
          stats: Json
          week: number
        }
        Update: {
          full_name?: string | null
          ingested_at?: string | null
          player_id?: string
          position?: string | null
          posteam?: string | null
          season?: number
          stats?: Json
          week?: number
        }
        Relationships: []
      }
      ff_rankings_weekly: {
        Row: {
          best: number | null
          ecr: number | null
          fp_id: string
          ingested_at: string | null
          page_type: string
          player: string | null
          pos: string | null
          scrape_date: string
          sd: number | null
          season: number
          team: string | null
          week: number
          worst: number | null
        }
        Insert: {
          best?: number | null
          ecr?: number | null
          fp_id: string
          ingested_at?: string | null
          page_type: string
          player?: string | null
          pos?: string | null
          scrape_date: string
          sd?: number | null
          season: number
          team?: string | null
          week: number
          worst?: number | null
        }
        Update: {
          best?: number | null
          ecr?: number | null
          fp_id?: string
          ingested_at?: string | null
          page_type?: string
          player?: string | null
          pos?: string | null
          scrape_date?: string
          sd?: number | null
          season?: number
          team?: string | null
          week?: number
          worst?: number | null
        }
        Relationships: []
      }
      market_lines: {
        Row: {
          away_moneyline: number | null
          away_spread_odds: number | null
          bookmaker: string | null
          captured_at: string
          fetched_at: string | null
          game_id: string
          home_moneyline: number | null
          home_spread_odds: number | null
          id: number
          over_odds: number | null
          source: string
          spread_line: number | null
          total_line: number | null
          under_odds: number | null
        }
        Insert: {
          away_moneyline?: number | null
          away_spread_odds?: number | null
          bookmaker?: string | null
          captured_at?: string
          fetched_at?: string | null
          game_id: string
          home_moneyline?: number | null
          home_spread_odds?: number | null
          id?: number
          over_odds?: number | null
          source?: string
          spread_line?: number | null
          total_line?: number | null
          under_odds?: number | null
        }
        Update: {
          away_moneyline?: number | null
          away_spread_odds?: number | null
          bookmaker?: string | null
          captured_at?: string
          fetched_at?: string | null
          game_id?: string
          home_moneyline?: number | null
          home_spread_odds?: number | null
          id?: number
          over_odds?: number | null
          source?: string
          spread_line?: number | null
          total_line?: number | null
          under_odds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_lines_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["game_id"]
          },
        ]
      }
      player_overrides: {
        Row: {
          note: string | null
          player_id: string
          season: number
          status: string | null
          updated_at: string | null
          usage_multiplier: number | null
          week: number
        }
        Insert: {
          note?: string | null
          player_id: string
          season: number
          status?: string | null
          updated_at?: string | null
          usage_multiplier?: number | null
          week: number
        }
        Update: {
          note?: string | null
          player_id?: string
          season?: number
          status?: string | null
          updated_at?: string | null
          usage_multiplier?: number | null
          week?: number
        }
        Relationships: []
      }
      player_stats_weekly: {
        Row: {
          ingested_at: string | null
          opponent_team: string | null
          player_id: string
          player_name: string | null
          position: string | null
          season: number
          stats: Json
          team: string | null
          week: number
        }
        Insert: {
          ingested_at?: string | null
          opponent_team?: string | null
          player_id: string
          player_name?: string | null
          position?: string | null
          season: number
          stats: Json
          team?: string | null
          week: number
        }
        Update: {
          ingested_at?: string | null
          opponent_team?: string | null
          player_id?: string
          player_name?: string | null
          position?: string | null
          season?: number
          stats?: Json
          team?: string | null
          week?: number
        }
        Relationships: []
      }
      players: {
        Row: {
          birth_date: string | null
          display_name: string | null
          dk_id: string | null
          esb_id: string | null
          espn_id: string | null
          fantasy_data_id: string | null
          fantasypros_id: string | null
          fd_id: string | null
          first_name: string | null
          gsis_id: string
          ingested_at: string | null
          last_name: string | null
          last_season: number | null
          latest_team: string | null
          merge_name: string | null
          nfl_id: string | null
          pff_id: string | null
          pfr_id: string | null
          position: string | null
          position_group: string | null
          rookie_season: number | null
          sleeper_id: string | null
          sportradar_id: string | null
          status: string | null
          yahoo_id: string | null
        }
        Insert: {
          birth_date?: string | null
          display_name?: string | null
          dk_id?: string | null
          esb_id?: string | null
          espn_id?: string | null
          fantasy_data_id?: string | null
          fantasypros_id?: string | null
          fd_id?: string | null
          first_name?: string | null
          gsis_id: string
          ingested_at?: string | null
          last_name?: string | null
          last_season?: number | null
          latest_team?: string | null
          merge_name?: string | null
          nfl_id?: string | null
          pff_id?: string | null
          pfr_id?: string | null
          position?: string | null
          position_group?: string | null
          rookie_season?: number | null
          sleeper_id?: string | null
          sportradar_id?: string | null
          status?: string | null
          yahoo_id?: string | null
        }
        Update: {
          birth_date?: string | null
          display_name?: string | null
          dk_id?: string | null
          esb_id?: string | null
          espn_id?: string | null
          fantasy_data_id?: string | null
          fantasypros_id?: string | null
          fd_id?: string | null
          first_name?: string | null
          gsis_id?: string
          ingested_at?: string | null
          last_name?: string | null
          last_season?: number | null
          latest_team?: string | null
          merge_name?: string | null
          nfl_id?: string | null
          pff_id?: string | null
          pfr_id?: string | null
          position?: string | null
          position_group?: string | null
          rookie_season?: number | null
          sleeper_id?: string | null
          sportradar_id?: string | null
          status?: string | null
          yahoo_id?: string | null
        }
        Relationships: []
      }
      rosters_weekly: {
        Row: {
          depth_chart_position: string | null
          full_name: string | null
          gsis_id: string
          position: string | null
          season: number
          status: string | null
          team: string
          week: number
        }
        Insert: {
          depth_chart_position?: string | null
          full_name?: string | null
          gsis_id: string
          position?: string | null
          season: number
          status?: string | null
          team: string
          week: number
        }
        Update: {
          depth_chart_position?: string | null
          full_name?: string | null
          gsis_id?: string
          position?: string | null
          season?: number
          status?: string | null
          team?: string
          week?: number
        }
        Relationships: []
      }
      schedules: {
        Row: {
          away_moneyline: number | null
          away_qb_id: string | null
          away_qb_name: string | null
          away_rest: number | null
          away_score: number | null
          away_spread_odds: number | null
          away_team: string
          div_game: number | null
          game_id: string
          game_type: string | null
          gameday: string | null
          gametime: string | null
          home_moneyline: number | null
          home_qb_id: string | null
          home_qb_name: string | null
          home_rest: number | null
          home_score: number | null
          home_spread_odds: number | null
          home_team: string
          ingested_at: string | null
          location: string | null
          over_odds: number | null
          overtime: number | null
          result: number | null
          roof: string | null
          season: number
          spread_line: number | null
          stadium: string | null
          surface: string | null
          temp: number | null
          total: number | null
          total_line: number | null
          under_odds: number | null
          week: number
          weekday: string | null
          wind: number | null
        }
        Insert: {
          away_moneyline?: number | null
          away_qb_id?: string | null
          away_qb_name?: string | null
          away_rest?: number | null
          away_score?: number | null
          away_spread_odds?: number | null
          away_team: string
          div_game?: number | null
          game_id: string
          game_type?: string | null
          gameday?: string | null
          gametime?: string | null
          home_moneyline?: number | null
          home_qb_id?: string | null
          home_qb_name?: string | null
          home_rest?: number | null
          home_score?: number | null
          home_spread_odds?: number | null
          home_team: string
          ingested_at?: string | null
          location?: string | null
          over_odds?: number | null
          overtime?: number | null
          result?: number | null
          roof?: string | null
          season: number
          spread_line?: number | null
          stadium?: string | null
          surface?: string | null
          temp?: number | null
          total?: number | null
          total_line?: number | null
          under_odds?: number | null
          week: number
          weekday?: string | null
          wind?: number | null
        }
        Update: {
          away_moneyline?: number | null
          away_qb_id?: string | null
          away_qb_name?: string | null
          away_rest?: number | null
          away_score?: number | null
          away_spread_odds?: number | null
          away_team?: string
          div_game?: number | null
          game_id?: string
          game_type?: string | null
          gameday?: string | null
          gametime?: string | null
          home_moneyline?: number | null
          home_qb_id?: string | null
          home_qb_name?: string | null
          home_rest?: number | null
          home_score?: number | null
          home_spread_odds?: number | null
          home_team?: string
          ingested_at?: string | null
          location?: string | null
          over_odds?: number | null
          overtime?: number | null
          result?: number | null
          roof?: string | null
          season?: number
          spread_line?: number | null
          stadium?: string | null
          surface?: string | null
          temp?: number | null
          total?: number | null
          total_line?: number | null
          under_odds?: number | null
          week?: number
          weekday?: string | null
          wind?: number | null
        }
        Relationships: []
      }
      snap_counts: {
        Row: {
          defense_pct: number | null
          defense_snaps: number | null
          offense_pct: number | null
          offense_snaps: number | null
          opponent: string | null
          pfr_player_id: string
          player: string | null
          position: string | null
          season: number
          st_pct: number | null
          st_snaps: number | null
          team: string | null
          week: number
        }
        Insert: {
          defense_pct?: number | null
          defense_snaps?: number | null
          offense_pct?: number | null
          offense_snaps?: number | null
          opponent?: string | null
          pfr_player_id: string
          player?: string | null
          position?: string | null
          season: number
          st_pct?: number | null
          st_snaps?: number | null
          team?: string | null
          week: number
        }
        Update: {
          defense_pct?: number | null
          defense_snaps?: number | null
          offense_pct?: number | null
          offense_snaps?: number | null
          opponent?: string | null
          pfr_player_id?: string
          player?: string | null
          position?: string | null
          season?: number
          st_pct?: number | null
          st_snaps?: number | null
          team?: string | null
          week?: number
        }
        Relationships: []
      }
      team_game_agg: {
        Row: {
          drives: number | null
          dropbacks: number | null
          epa_per_dropback: number | null
          epa_per_play: number | null
          fg_att: number | null
          fg_made: number | null
          fg_per_drive: number | null
          fumbles_lost: number | null
          game_id: string
          home: number
          ingested_at: string | null
          interceptions: number | null
          neutral_pass_rate: number | null
          opponent: string
          pass_att: number | null
          pass_rate: number | null
          pass_td: number | null
          pass_yds: number | null
          plays: number | null
          plays_per_drive: number | null
          points: number | null
          rush_att: number | null
          rush_td: number | null
          rush_yds: number | null
          sacks: number | null
          season: number
          td: number | null
          team: string
          week: number
          yds_per_att: number | null
        }
        Insert: {
          drives?: number | null
          dropbacks?: number | null
          epa_per_dropback?: number | null
          epa_per_play?: number | null
          fg_att?: number | null
          fg_made?: number | null
          fg_per_drive?: number | null
          fumbles_lost?: number | null
          game_id: string
          home: number
          ingested_at?: string | null
          interceptions?: number | null
          neutral_pass_rate?: number | null
          opponent: string
          pass_att?: number | null
          pass_rate?: number | null
          pass_td?: number | null
          pass_yds?: number | null
          plays?: number | null
          plays_per_drive?: number | null
          points?: number | null
          rush_att?: number | null
          rush_td?: number | null
          rush_yds?: number | null
          sacks?: number | null
          season: number
          td?: number | null
          team: string
          week: number
          yds_per_att?: number | null
        }
        Update: {
          drives?: number | null
          dropbacks?: number | null
          epa_per_dropback?: number | null
          epa_per_play?: number | null
          fg_att?: number | null
          fg_made?: number | null
          fg_per_drive?: number | null
          fumbles_lost?: number | null
          game_id?: string
          home?: number
          ingested_at?: string | null
          interceptions?: number | null
          neutral_pass_rate?: number | null
          opponent?: string
          pass_att?: number | null
          pass_rate?: number | null
          pass_td?: number | null
          pass_yds?: number | null
          plays?: number | null
          plays_per_drive?: number | null
          points?: number | null
          rush_att?: number | null
          rush_td?: number | null
          rush_yds?: number | null
          sacks?: number | null
          season?: number
          td?: number | null
          team?: string
          week?: number
          yds_per_att?: number | null
        }
        Relationships: []
      }
      team_stats_weekly: {
        Row: {
          ingested_at: string | null
          opponent_team: string | null
          season: number
          stats: Json
          team: string
          week: number
        }
        Insert: {
          ingested_at?: string | null
          opponent_team?: string | null
          season: number
          stats: Json
          team: string
          week: number
        }
        Update: {
          ingested_at?: string | null
          opponent_team?: string | null
          season?: number
          stats?: Json
          team?: string
          week?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  model: {
    Enums: {},
  },
  raw: {
    Enums: {},
  },
} as const
