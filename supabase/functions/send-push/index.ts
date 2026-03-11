import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

Deno.serve(async (req) => {
  console.log(`[send-push] Request: ${req.method} ${req.url}`)
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  }

  try {
    const { title, body, url, icon, image, actions, user_id } = await req.json()

    if (!user_id) throw new Error('user_id is required')

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Setup VAPID
    webpush.setVapidDetails(
      'mailto:admin@gelato.az',
      Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
      Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    )

    // Get user subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    if (error) throw error

    const results = await Promise.all((subscriptions || []).map(async (sub) => {
      try {
        const pushConfig = {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.auth,
            p256dh: sub.p256dh
          }
        }

        await webpush.sendNotification(pushConfig, JSON.stringify({
          title,
          body,
          url,
          icon: icon || '/icon-192.png',
          image: image || null,
          actions: actions || []
        }))

        return { success: true }
      } catch (err) {
        // If 404 or 410, sub is expired/invalid
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
        return { success: false, error: err.message }
      }
    }))

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
