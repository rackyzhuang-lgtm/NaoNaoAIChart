import { describe, expect, it } from 'vitest'
import {
  sub2ApiAnnouncementsSchema,
  sub2ApiAuthResponseSchema,
  sub2ApiChannelMonitorResponseSchema,
  sub2ApiLoginResponseSchema,
  sub2ApiModelPlazaResponseSchema,
  sub2ApiPlatformQuotasResponseSchema,
  sub2ApiRedeemCodeRequestSchema,
  sub2ApiRedeemHistoryItemSchema,
  sub2ApiRedeemResultSchema,
  sub2ApiRefreshResponseSchema,
  sub2ApiSubscriptionSummarySchema,
  sub2ApiUsageDashboardModelsSchema,
  sub2ApiUsageDashboardStatsSchema,
  sub2ApiUsageDashboardTrendSchema,
  sub2ApiUsageErrorRequestDetailSchema,
  sub2ApiUsageErrorRequestPageSchema,
  sub2ApiUsageRecordPageSchema,
} from './contracts'

const user = {
  id: 1,
  username: 'test-user',
  email: 'user@example.test',
  role: 'user',
  balance: 10,
  concurrency: 2,
  status: 'active',
}

describe('sub2api contracts', () => {
  it('accepts authenticated and two-factor login responses', () => {
    expect(
      sub2ApiLoginResponseSchema.parse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 900,
        token_type: 'Bearer',
        user,
      })
    ).toMatchObject({ user })

    expect(
      sub2ApiLoginResponseSchema.parse({
        requires_2fa: true,
        temp_token: 'temporary-token',
        user_email_masked: 'u***@example.test',
      })
    ).toMatchObject({ requires_2fa: true })
  })

  it('rejects incomplete rotating refresh token pairs', () => {
    expect(
      sub2ApiRefreshResponseSchema.safeParse({
        access_token: 'access-token',
        expires_in: 900,
        token_type: 'Bearer',
      }).success
    ).toBe(false)
  })

  it('strips unexpected token fields from renderer-facing users', () => {
    const response = sub2ApiAuthResponseSchema.parse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 900,
      token_type: 'Bearer',
      user: {
        ...user,
        access_token: 'unexpected-user-access-token',
        refresh_token: 'unexpected-user-refresh-token',
      },
    })

    expect(response.user).toEqual(user)
    expect(response.user).not.toHaveProperty('access_token')
    expect(response.user).not.toHaveProperty('refresh_token')
  })

  it('accepts read-only usage and subscription summaries', () => {
    const usage = sub2ApiUsageDashboardStatsSchema.parse({
      total_api_keys: 2,
      active_api_keys: 1,
      total_requests: 25,
      total_input_tokens: 100,
      total_output_tokens: 50,
      total_cache_creation_tokens: 0,
      total_cache_read_tokens: 10,
      total_tokens: 160,
      total_cost: 1.5,
      total_actual_cost: 1.25,
      today_requests: 4,
      today_input_tokens: 20,
      today_output_tokens: 10,
      today_cache_creation_tokens: 0,
      today_cache_read_tokens: 2,
      today_tokens: 32,
      today_cost: 0.3,
      today_actual_cost: 0.25,
      average_duration_ms: 520,
      rpm: 0.4,
      tpm: 12,
      internal_note: 'must be stripped',
    })
    expect(usage).not.toHaveProperty('internal_note')

    expect(
      sub2ApiSubscriptionSummarySchema.parse({
        active_count: 1,
        total_used_usd: 0.25,
        subscriptions: [
          {
            id: 9,
            group_id: 3,
            group_name: 'Standard',
            status: 'active',
            daily_used_usd: 0.25,
            daily_limit_usd: 10,
            expires_at: '2026-09-01T00:00:00Z',
          },
        ],
      })
    ).toMatchObject({ active_count: 1, subscriptions: [{ group_name: 'Standard' }] })
  })

  it('accepts an empty or configured platform quota response', () => {
    expect(sub2ApiPlatformQuotasResponseSchema.parse({ platform_quotas: [] })).toEqual({ platform_quotas: [] })
    expect(
      sub2ApiPlatformQuotasResponseSchema.parse({
        platform_quotas: [
          {
            platform: 'openai',
            daily_limit_usd: 10,
            weekly_limit_usd: null,
            monthly_limit_usd: null,
            daily_usage_usd: 2,
            weekly_usage_usd: 4,
            monthly_usage_usd: 6,
            daily_window_resets_at: '2026-08-07T00:00:00Z',
          },
        ],
      })
    ).toMatchObject({ platform_quotas: [{ platform: 'openai', daily_usage_usd: 2 }] })
  })

  it('accepts trend and model dashboard responses', () => {
    const trendItem = {
      date: '2026-08-05',
      requests: 2,
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_tokens: 0,
      cache_read_tokens: 1,
      total_tokens: 16,
      cost: 0.2,
      actual_cost: 0.15,
    }
    expect(
      sub2ApiUsageDashboardTrendSchema.parse({
        trend: [trendItem],
        start_date: '2026-07-30',
        end_date: '2026-08-05',
        granularity: 'day',
      })
    ).toMatchObject({ trend: [{ date: '2026-08-05' }] })
    expect(
      sub2ApiUsageDashboardModelsSchema.parse({
        models: [{ model: 'gpt-5', ...trendItem }],
        start_date: '2026-07-30',
        end_date: '2026-08-05',
      })
    ).toMatchObject({ models: [{ model: 'gpt-5', total_tokens: 16 }] })
  })

  it('accepts a redacted usage record page', () => {
    expect(
      sub2ApiUsageRecordPageSchema.parse({
        items: [
          {
            id: 11,
            api_key_id: 7,
            model: 'gpt-5',
            request_type: 'chat_completion',
            stream: true,
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            total_cost: 0.2,
            actual_cost: 0.15,
            duration_ms: null,
            created_at: '2026-08-05T12:00:00Z',
            api_key: { key: 'must be stripped' },
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        pages: 1,
      })
    ).toMatchObject({ items: [{ model: 'gpt-5' }] })
  })

  it('accepts redacted error request pages and details', () => {
    const base = {
      id: 41,
      created_at: '2026-08-05T13:00:00Z',
      model: 'gpt-5',
      inbound_endpoint: '/v1/chat/completions',
      status_code: 429,
      category: 'rate_limit',
      platform: 'openai',
      message: 'Rate limit exceeded',
      key_name: 'desktop-key',
      key_deleted: false,
      stream: true,
    }
    expect(
      sub2ApiUsageErrorRequestPageSchema.parse({ items: [base], total: 1, page: 1, page_size: 20, pages: 1 })
    ).toMatchObject({ items: [{ category: 'rate_limit' }] })
    expect(
      sub2ApiUsageErrorRequestDetailSchema.parse({
        ...base,
        error_body: '{"error":"rate limited"}',
        upstream_status_code: 429,
      })
    ).toMatchObject({ error_body: '{"error":"rate limited"}' })
  })

  it('validates redemption results and history records without admin fields', () => {
    expect(sub2ApiRedeemCodeRequestSchema.parse({ code: '  redeem-code  ' })).toEqual({ code: 'redeem-code' })
    expect(sub2ApiRedeemResultSchema.parse({ message: 'ok', type: 'balance', value: 5, internal: 'hidden' })).toEqual({
      message: 'ok',
      type: 'balance',
      value: 5,
    })
    expect(
      sub2ApiRedeemHistoryItemSchema.parse({
        id: 1,
        code: 'secret-code',
        type: 'balance',
        value: 5,
        status: 'used',
        used_at: null,
        created_at: '2026-08-06T00:00:00Z',
        notes: 'admin-only',
      })
    ).not.toHaveProperty('notes')
    expect(() => sub2ApiRedeemCodeRequestSchema.parse({ code: ' ' })).toThrow()
  })

  it('validates channel monitor summaries and strips unknown fields', () => {
    expect(
      sub2ApiChannelMonitorResponseSchema.parse({
        items: [
          {
            id: 2,
            name: 'GPT stable',
            provider: 'openai',
            group_name: '',
            primary_model: 'gpt-5.6-terra',
            primary_status: 'operational',
            primary_latency_ms: 1200,
            availability_7d: 99.2,
            admin_note: 'hidden',
          },
        ],
      })
    ).toEqual({
      items: [
        {
          id: 2,
          name: 'GPT stable',
          provider: 'openai',
          group_name: '',
          primary_model: 'gpt-5.6-terra',
          primary_status: 'operational',
          primary_latency_ms: 1200,
          availability_7d: 99.2,
        },
      ],
    })
  })

  it('validates model plaza groups and strips admin fields', () => {
    expect(
      sub2ApiModelPlazaResponseSchema.parse({
        description: 'Available models',
        groups: [
          {
            id: 2,
            name: 'GPT group',
            platform: 'openai',
            rate_multiplier: 0.8,
            models: [
              {
                name: 'gpt-5.6-terra',
                pricing: { billing_mode: 'token', input_price: 1.25, internal_cost: 9 },
                channel_ids: [1, 2],
              },
            ],
            admin_note: 'hidden',
          },
        ],
      })
    ).toEqual({
      description: 'Available models',
      groups: [
        {
          id: 2,
          name: 'GPT group',
          platform: 'openai',
          rate_multiplier: 0.8,
          models: [{ name: 'gpt-5.6-terra', pricing: { billing_mode: 'token', input_price: 1.25 } }],
        },
      ],
    })
  })

  it('validates user announcements and strips read statistics', () => {
    expect(
      sub2ApiAnnouncementsSchema.parse([
        {
          id: 9,
          title: 'Maintenance',
          content: 'Service window',
          notify_mode: 'popup',
          read_at: null,
          created_at: '2026-08-06T00:00:00Z',
          updated_at: '2026-08-06T01:00:00Z',
          read_count: 42,
        },
      ])
    ).toEqual([
      {
        id: 9,
        title: 'Maintenance',
        content: 'Service window',
        notify_mode: 'popup',
        read_at: null,
        created_at: '2026-08-06T00:00:00Z',
        updated_at: '2026-08-06T01:00:00Z',
      },
    ])
  })
})
