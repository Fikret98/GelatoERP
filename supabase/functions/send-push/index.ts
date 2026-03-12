import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, url, icon, image, actions, user_id } = await req.json()
    console.log(`[send-push] Processing for user: ${user_id}`)

    if (!user_id) throw new Error('user_id is required')

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Setup VAPID
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')

    console.log(`[send-push] VAPID Public Key length: ${publicKey?.length || 0}`)
    console.log(`[send-push] VAPID Private Key length: ${privateKey?.length || 0}`)

    if (!publicKey || !privateKey) {
      throw new Error('VAPID keys are missing from environment variables')
    }

    try {
      webpush.setVapidDetails(
        'mailto:admin@gelato.az',
        publicKey,
        privateKey
      )
    } catch (vapidError) {
      console.error('[send-push] VAPID initialization failed:', vapidError.message)
      throw new Error(`VAPID Init Error: ${vapidError.message}`)
    }

    // Get user subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    if (error) {
      console.error('Database error:', error)
      throw error
    }

    console.log(`[send-push] Found ${subscriptions?.length || 0} subscriptions`)

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

        return { success: true, endpoint: sub.endpoint }
      } catch (err) {
        console.error(`[send-push] Error sending to ${sub.endpoint}:`, err)
        // If 401, 403, 404 or 410, sub is expired/invalid
        if ([401, 403, 404, 410].includes(err.statusCode)) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
        return { success: false, error: err.message, endpoint: sub.endpoint }
      }
    }))

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[send-push] Critical error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
