import { withSupabase } from '@supabase/server';

// El wrapper valida el JWT y gestiona CORS antes de usar el cliente service_role.
export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'POST') {
      return Response.json({ code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
    }
    if (!ctx.userClaims?.id) {
      return Response.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('refresh_asset_prices');
    if (error) {
      console.error('refresh_asset_prices failed:', error.code);
      return Response.json({ code: 'QUOTE_REFRESH_FAILED' }, { status: 500 });
    }

    return Response.json({ refreshed_count: data });
  }),
};
